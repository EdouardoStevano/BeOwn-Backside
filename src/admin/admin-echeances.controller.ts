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
import { formatEur } from 'src/common/money/format-eur';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
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
import { TriggerEcheancePaymentUseCase } from './usecases/trigger-echeance-payment.usecase';
import { GetAggregatedScheduleUseCase } from './usecases/get-aggregated-schedule.usecase';
import { PatchAggregatedEcheanceUseCase } from './usecases/patch-aggregated-echeance.usecase';

const ADMIN_ROLES = rolesWithPermission('echeancier:read');
const PAY_ROLES: string[] = rolesWithPermission('echeancier:pay');

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
    private readonly triggerEcheancePayment: TriggerEcheancePaymentUseCase,
    private readonly aggregatedSchedule: GetAggregatedScheduleUseCase,
    private readonly patchAggregatedEcheance: PatchAggregatedEcheanceUseCase,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  private async assertPay(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !PAY_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @ApiOperation({
    summary: "Déclencher manuellement le paiement d'une échéance pour tous les investisseurs",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro de l'échéance (1-based)" })
  @ApiResponse({ status: 200, description: 'Récap : nb investisseurs payés + montant total' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':numero/trigger-payment')
  async triggerPayment(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
    @Body() body?: { motif?: string },
  ): Promise<{ paidCount: number; totalAmount: number; skipped: number }> {
    await this.assertPay(admin);
    return this.triggerEcheancePayment.execute(projectId, numero, admin);
  }

  @ApiOperation({ summary: "Marquer une échéance comme payée (crédite le wallet)" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':id/pay')
  async markPaid(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertPay(user);
    return this.payEcheance.execute(id, user.userId, user.role);
  }

  @ApiOperation({
    summary: "Vérifier une échéance (numero) : la marque prête à l'auto-paiement",
    description:
      "Passe les EcheanceEntity A_VENIR du projet ayant ce numéro à EN_ATTENTE_PAIEMENT. Le CRON quotidien paiera automatiquement ces échéances à leur date.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':numero/verify')
  async verify(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ verified: number }> {
    await this.assertPay(admin);
    const investments = await this.investRepo.find({ where: { projetId: projectId } });
    const investmentIds = investments.map((i) => i.id);
    if (investmentIds.length === 0) {
      throw new NotFoundException('Aucun investissement sur ce projet');
    }
    const targets = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero, statut: EcheanceStatus.A_VENIR },
    });
    for (const e of targets) {
      await this.echeanceRepo.update({ id: e.id }, {
        statut: EcheanceStatus.EN_ATTENTE_PAIEMENT,
        statutChangeLe: new Date(),
      });
    }
    this.notifications
      .pushToAdmins({
        type: NotificationType.ECHEANCE,
        titre: `Échéance #${numero} vérifiée`,
        message: `L'échéance ${numero} est vérifiée : elle sera payée automatiquement à sa date (${targets.length} investisseur(s)).`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: { projectId, numero, verified: targets.length, by: admin.userId },
      })
      .catch(() => {});
    return { verified: targets.length };
  }

  @ApiOperation({ summary: "Annuler la vérification d'une échéance (numero)" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':numero/unverify')
  async unverify(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ reverted: number }> {
    await this.assertPay(admin);
    const investments = await this.investRepo.find({ where: { projetId: projectId } });
    const investmentIds = investments.map((i) => i.id);
    if (investmentIds.length === 0) return { reverted: 0 };
    const targets = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero, statut: EcheanceStatus.EN_ATTENTE_PAIEMENT },
    });
    for (const e of targets) {
      await this.echeanceRepo.update({ id: e.id }, {
        statut: EcheanceStatus.A_VENIR,
        statutChangeLe: new Date(),
      });
    }
    return { reverted: targets.length };
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
    return this.aggregatedSchedule.execute(projectId);
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
    return this.patchAggregatedEcheance.execute(projectId, numero, dto);
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

  private async assertPay(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !PAY_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @ApiOperation({ summary: "Mettre à jour une échéance" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @RequirePermission('echeancier:pay')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEcheanceDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<EcheanceEntity> {
    await this.assertPay(user);
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
