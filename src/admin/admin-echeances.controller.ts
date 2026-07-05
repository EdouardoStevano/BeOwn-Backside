import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import {
  UserEntity,
  UserRole,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import {
  EcheanceStatus,
  InvestmentStatus,
} from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { PayEcheanceUseCase } from 'src/investments/applications/usecases/pay-echeance.usecase';
import { ProjectScheduleGeneratorService } from 'src/investments/applications/project-schedule-generator.service';

const ADMIN_ROLES = rolesWithPermission('echeancier:read');

const round2 = (n: number) => Math.round(n * 100) / 100;

class UpdateEcheanceDto {
  @IsOptional() @IsDateString() datePrevue?: string;
  @IsOptional() @IsNumber() @Min(0) montantCapital?: number;
  @IsOptional() @IsNumber() @Min(0) montantInterets?: number;
  @IsOptional() @IsEnum(EcheanceStatus) statut?: EcheanceStatus;
}

class UpdateAggregatedEcheanceDto {
  @IsOptional() @IsDateString() datePrevue?: string;
  @IsOptional() @IsNumber() @Min(0) montantCapital?: number;
  @IsOptional() @IsNumber() @Min(0) montantInterets?: number;
  @IsOptional() @IsNumber() @Min(0) montantTotal?: number;
}

class InitializeScheduleDto {
  @IsDateString() dateDebut: string;
}

@ApiTags('Admin — Échéances')
@ApiBearerAuth()
@Controller('admin/projects/:projectId/echeances')
@UseGuards(JwtAuthGuard)
@RequirePermission('echeancier:read')
export class AdminEcheancesController {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EcheanceEntity) private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(InvestmentEntity) private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(WalletEntity) private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity) private readonly txRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly payEcheance: PayEcheanceUseCase,
    private readonly scheduleGenerator: ProjectScheduleGeneratorService,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @Post(':numero/trigger-payment')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @ApiOperation({
    summary: "Déclencher manuellement le paiement d'une échéance pour tous les investisseurs",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro de l'échéance (1-based)" })
  @ApiResponse({ status: 200, description: 'Récap : nb investisseurs payés + montant total' })
  async triggerPayment(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
    @Body() body?: { motif?: string },
  ): Promise<{ paidCount: number; totalAmount: number; skipped: number }> {
    await this.assertAdmin(admin);
    if (numero < 1) throw new BadRequestException("Numéro d'échéance invalide");

    // 1. Charger les investissements confirmés du projet
    const investments = await this.investRepo.find({
      where: { projetId: projectId, statut: InvestmentStatus.CONFIRME },
    });
    if (investments.length === 0) {
      throw new NotFoundException('Aucun investissement confirmé sur ce projet');
    }

    const investmentIds = investments.map((i) => i.id);

    // 2. Trouver les échéances correspondantes
    const echeances = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero },
    });
    if (echeances.length === 0) {
      throw new NotFoundException(`Aucune échéance #${numero} trouvée pour ce projet`);
    }

    const investmentByid = new Map(investments.map((i) => [i.id, i]));

    let paidCount = 0;
    let totalAmount = 0;
    let skipped = 0;

    // 3. Pour chaque échéance, créditer le wallet investisseur dans une transaction
    for (const ech of echeances) {
      if (ech.statut === EcheanceStatus.PAYE) {
        skipped++;
        continue;
      }

      const invest = investmentByid.get(ech.investissementId);
      if (!invest) {
        skipped++;
        continue;
      }
      const montant = Number(ech.montantTotal);
      if (montant <= 0) {
        skipped++;
        continue;
      }

      try {
        await this.dataSource.transaction(async (em) => {
          const wallet = await em.findOne(WalletEntity, {
            where: { proprietaireUserId: invest.utilisateurId, type: WalletType.INVESTISSEUR },
          });
          if (!wallet) throw new Error(`Wallet introuvable pour user ${invest.utilisateurId}`);

          wallet.solde = Number(wallet.solde) + montant;
          await em.save(WalletEntity, wallet);

          await em.save(TransactionEntity, em.create(TransactionEntity, {
            walletId: wallet.id,
            walletSource: null,
            walletDestination: wallet.id,
            type: TransactionType.REMBOURSEMENT_CAPITAL,
            montant,
            devise: wallet.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: invest.id,
            projetId: projectId,
            idempotencyKey: `echeance-pay:${ech.id}`,
            fraisPsp: 0,
            fraisPlateforme: 0,
          }));

          ech.statut = EcheanceStatus.PAYE;
          ech.payeLe = new Date();
          await em.save(EcheanceEntity, ech);
        });

        paidCount++;
        totalAmount += montant;

        this.notifications
          .push({
            utilisateurId: invest.utilisateurId,
            type: NotificationType.ECHEANCE,
            titre: `Échéance #${numero} reçue`,
            message: `Vous avez reçu ${montant} XOF sur votre wallet (échéance ${numero} du projet).`,
            metadata: { investissementId: invest.id, echeanceId: ech.id, montant, numero },
          })
          .catch(() => {});
      } catch {
        skipped++;
      }
    }

    this.notifications
      .pushToAdmins({
        type: NotificationType.ECHEANCE,
        titre: `Échéance #${numero} déclenchée`,
        message: `Admin a déclenché l'échéance ${numero} : ${paidCount} investisseur(s) crédité(s) pour ${totalAmount} XOF.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: { projectId, numero, paidCount, totalAmount, triggeredBy: admin.userId },
      })
      .catch(() => {});

    return { paidCount, totalAmount, skipped };
  }

  @ApiOperation({ summary: "Marquer une échéance comme payée (crédite le wallet)" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':id/pay')
  async markPaid(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user);
    return this.payEcheance.execute(id, user.userId);
  }

  @ApiOperation({
    summary: "Échéancier agrégé du projet (vue admin, une ligne par numéro)",
    description:
      "Retourne l'échéancier emprunteur en agrégeant les EcheanceEntity de tous les investissements par numéro : somme des capitaux/intérêts/totaux, date partagée, statut le plus avancé.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @Get()
  async getAggregatedSchedule(
    @Param('projectId') projectId: string,
    @CurrentUser() admin: ActiveUser,
  ): Promise<
    Array<{
      numero: number;
      datePrevue: string;
      montantCapital: number;
      montantInterets: number;
      montantTotal: number;
      capitalRestantAvant: number;
      capitalRestantApres: number;
      statut: EcheanceStatus;
      nbInvestisseurs: number;
      nbPayes: number;
    }>
  > {
    await this.assertAdmin(admin);

    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    const investmentIds = investments.map((i) => i.id);
    if (investmentIds.length === 0) return [];

    const rows = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds) },
      order: { numero: 'ASC', datePrevue: 'ASC' },
    });

    const byNumero = new Map<
      number,
      {
        numero: number;
        datePrevue: string;
        montantCapital: number;
        montantInterets: number;
        montantTotal: number;
        statuts: EcheanceStatus[];
      }
    >();

    for (const r of rows) {
      const key = r.numero;
      const dateStr =
        r.datePrevue instanceof Date
          ? r.datePrevue.toISOString().slice(0, 10)
          : String(r.datePrevue).slice(0, 10);
      const existing = byNumero.get(key);
      if (existing) {
        existing.montantCapital += Number(r.montantCapital);
        existing.montantInterets += Number(r.montantInterets);
        existing.montantTotal += Number(r.montantTotal);
        existing.statuts.push(r.statut);
        if (dateStr < existing.datePrevue) existing.datePrevue = dateStr;
      } else {
        byNumero.set(key, {
          numero: r.numero,
          datePrevue: dateStr,
          montantCapital: Number(r.montantCapital),
          montantInterets: Number(r.montantInterets),
          montantTotal: Number(r.montantTotal),
          statuts: [r.statut],
        });
      }
    }

    const sorted = [...byNumero.values()].sort((a, b) => a.numero - b.numero);
    const totalCapital = sorted.reduce((s, r) => s + r.montantCapital, 0);

    let running = totalCapital;
    return sorted.map((r) => {
      const before = round2(running);
      const after = round2(running - r.montantCapital);
      running = after;

      const allPaid = r.statuts.every((s) => s === EcheanceStatus.PAYE);
      const anyLate = r.statuts.some((s) => s === EcheanceStatus.RETARD);
      const anyUnpaid = r.statuts.some((s) => s === EcheanceStatus.IMPAYE);
      const statut = anyUnpaid
        ? EcheanceStatus.IMPAYE
        : anyLate
        ? EcheanceStatus.RETARD
        : allPaid
        ? EcheanceStatus.PAYE
        : EcheanceStatus.A_VENIR;

      return {
        numero: r.numero,
        datePrevue: r.datePrevue,
        montantCapital: round2(r.montantCapital),
        montantInterets: round2(r.montantInterets),
        montantTotal: round2(r.montantTotal),
        capitalRestantAvant: before,
        capitalRestantApres: after,
        statut,
        nbInvestisseurs: r.statuts.length,
        nbPayes: r.statuts.filter((s) => s === EcheanceStatus.PAYE).length,
      };
    });
  }

  @ApiOperation({
    summary: 'Modifier une échéance agrégée (date et/ou montants totaux)',
    description:
      "Met à jour les EcheanceEntity du projet ayant ce numéro (A_VENIR uniquement). Si un montant total est fourni (capital, intérêts ou total), il est réparti au prorata des fractions détenues entre les investisseurs.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @Patch(':numero')
  async patchAggregated(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: UpdateAggregatedEcheanceDto,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ updated: number }> {
    await this.assertAdmin(admin);
    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    if (investments.length === 0) {
      throw new NotFoundException('Aucun investissement sur ce projet');
    }

    const investmentIds = investments.map((i) => i.id);
    const targets = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero },
    });
    const editable = targets.filter((e) => e.statut === EcheanceStatus.A_VENIR);
    if (editable.length === 0) {
      throw new BadRequestException(
        "Aucune échéance modifiable pour ce numéro (toutes sont payées ou en retard).",
      );
    }

    const editableInvestIds = new Set(editable.map((e) => e.investissementId));
    const editableInvests = investments.filter((i) => editableInvestIds.has(i.id));
    const totalFractions = editableInvests.reduce(
      (s, i) => s + Number(i.nbTitres),
      0,
    );

    const hasMontant =
      dto.montantCapital !== undefined ||
      dto.montantInterets !== undefined ||
      dto.montantTotal !== undefined;

    if (hasMontant && totalFractions === 0) {
      throw new BadRequestException(
        'Impossible de répartir : aucune fraction détenue par les investisseurs actifs.',
      );
    }

    for (const ech of editable) {
      const patch: Partial<EcheanceEntity> = {};
      if (dto.datePrevue) patch.datePrevue = new Date(dto.datePrevue);

      if (hasMontant) {
        const inv = editableInvests.find((i) => i.id === ech.investissementId);
        if (!inv) continue;
        const share = Number(inv.nbTitres) / totalFractions;

        const newCap =
          dto.montantCapital !== undefined
            ? round2(dto.montantCapital * share)
            : Number(ech.montantCapital);
        const newInt =
          dto.montantInterets !== undefined
            ? round2(dto.montantInterets * share)
            : Number(ech.montantInterets);
        const newTotal =
          dto.montantTotal !== undefined
            ? round2(dto.montantTotal * share)
            : round2(newCap + newInt);

        patch.montantCapital = newCap;
        patch.montantInterets = newInt;
        patch.montantTotal = newTotal;
      }

      if (Object.keys(patch).length > 0) {
        await this.echeanceRepo.update({ id: ech.id }, patch);
      }
    }

    return { updated: editable.length };
  }

  @ApiOperation({
    summary: 'Supprimer toutes les échéances d\'un numéro pour ce projet',
    description:
      "Supprime les EcheanceEntity du projet ayant ce numéro (uniquement si toutes A_VENIR). Renumérote les suivantes pour combler le trou.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @HttpCode(HttpStatus.OK)
  @Delete(':numero')
  async deleteAggregated(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ deleted: number; renumbered: number }> {
    await this.assertAdmin(admin);
    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    if (investments.length === 0) {
      throw new NotFoundException('Aucun investissement sur ce projet');
    }
    const investmentIds = investments.map((i) => i.id);

    const targets = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero },
    });
    if (targets.length === 0) {
      throw new NotFoundException(`Aucune échéance #${numero} sur ce projet`);
    }
    const blocked = targets.find((e) => e.statut !== EcheanceStatus.A_VENIR);
    if (blocked) {
      throw new BadRequestException(
        "Impossible de supprimer ce numéro : au moins une échéance n'est plus A_VENIR.",
      );
    }

    const del = await this.echeanceRepo.delete({
      id: In(targets.map((e) => e.id)),
    });

    const later = await this.echeanceRepo
      .createQueryBuilder()
      .update(EcheanceEntity)
      .set({ numero: () => '"numero" - 1' })
      .where('"investissementId" IN (:...ids)', { ids: investmentIds })
      .andWhere('"numero" > :n', { n: numero })
      .execute();

    return {
      deleted: del.affected ?? 0,
      renumbered: later.affected ?? 0,
    };
  }

  @ApiOperation({
    summary: "Créer l'échéancier emprunteur (admin) à partir d'une date de début",
    description:
      "Crée les EcheanceEntity pour tous les investissements actifs du projet : N lignes mensuelles (= dureeMois) ancrées sur dateDebut, montants pré-calculés au prorata des fractions détenues. In-fine : intérêts mensuels constants, capital à la dernière échéance. Refusé si un échéancier existe déjà.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @HttpCode(HttpStatus.OK)
  @Post('initialize')
  async initialize(
    @Param('projectId') projectId: string,
    @Body() dto: InitializeScheduleDto,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ investmentsProcessed: number; echeancesGenerated: number }> {
    await this.assertAdmin(admin);
    try {
      return await this.scheduleGenerator.initializeForProject(
        projectId,
        new Date(dto.dateDebut),
      );
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Création échouée');
    }
  }

  @ApiOperation({
    summary: 'Régénérer les échéances A_VENIR (utilitaire admin)',
    description:
      "Supprime les échéances A_VENIR et les recalcule à partir d'une nouvelle date. Préserve les échéances payées/retard.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: "Résumé : nb investissements + nb générées + nb supprimées" })
  @HttpCode(HttpStatus.OK)
  @Post('recompute')
  async recompute(
    @Param('projectId') projectId: string,
    @Body() dto: InitializeScheduleDto,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ investmentsProcessed: number; echeancesGenerated: number; echeancesDeleted: number }> {
    await this.assertAdmin(admin);
    return this.scheduleGenerator.regenerateForProject(
      projectId,
      new Date(dto.dateDebut),
    );
  }
}

@ApiTags('Admin — Échéances (item)')
@ApiBearerAuth()
@Controller('admin/echeances')
@UseGuards(JwtAuthGuard)
@RequirePermission('echeancier:read')
export class AdminEcheancesItemController {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EcheanceEntity) private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @ApiOperation({ summary: "Mettre à jour une échéance" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEcheanceDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<EcheanceEntity> {
    await this.assertAdmin(user);
    const ech = await this.echeanceRepo.findOne({ where: { id } });
    if (!ech) throw new NotFoundException('Échéance introuvable.');
    if (ech.statut === EcheanceStatus.PAYE) {
      throw new BadRequestException("Une échéance payée ne peut plus être modifiée.");
    }
    const patch: Partial<EcheanceEntity> = {};
    if (dto.datePrevue) patch.datePrevue = new Date(dto.datePrevue);
    if (dto.montantCapital !== undefined) patch.montantCapital = dto.montantCapital;
    if (dto.montantInterets !== undefined) patch.montantInterets = dto.montantInterets;
    if (dto.statut) patch.statut = dto.statut;
    if (patch.montantCapital !== undefined || patch.montantInterets !== undefined) {
      const cap = patch.montantCapital ?? Number(ech.montantCapital);
      const int = patch.montantInterets ?? Number(ech.montantInterets);
      patch.montantTotal = Number(cap) + Number(int);
    }
    await this.echeanceRepo.update({ id }, patch);
    return this.echeanceRepo.findOneOrFail({ where: { id } });
  }

  @ApiOperation({ summary: "Supprimer une échéance (uniquement si non payée)" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUser): Promise<void> {
    await this.assertAdmin(user);
    const ech = await this.echeanceRepo.findOne({ where: { id } });
    if (!ech) throw new NotFoundException('Échéance introuvable.');
    if (ech.statut === EcheanceStatus.PAYE) {
      throw new BadRequestException("Une échéance payée ne peut pas être supprimée.");
    }
    await this.echeanceRepo.delete({ id });
  }
}
