import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
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

const ADMIN_ROLES = [
  UserRole.ADMIN,
  UserRole.FINANCIER,
  UserRole.COMPLIANCE,
  UserRole.RCCI,
];

@ApiTags('Admin — Échéances')
@ApiBearerAuth()
@Controller('admin/projects/:projectId/echeances')
@UseGuards(JwtAuthGuard)
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
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @Post(':numero/trigger-payment')
  @HttpCode(HttpStatus.OK)
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
        roles: [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: { projectId, numero, paidCount, totalAmount, triggeredBy: admin.userId },
      })
      .catch(() => {});

    return { paidCount, totalAmount, skipped };
  }

  @ApiOperation({ summary: "Marquer une échéance comme payée (crédite le wallet)" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.OK)
  @Post(':id/pay')
  async markPaid(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user);
    return this.payEcheance.execute(id, user.userId);
  }
}
