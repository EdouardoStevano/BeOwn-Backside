import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { formatEur } from 'src/common/money/format-eur';
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

/**
 * Déclenche manuellement le paiement d'une échéance (numero) pour tous les
 * investisseurs confirmés d'un projet : crédit du wallet + transaction de
 * remboursement capital + passage de l'échéance à PAYE, le tout par
 * investisseur dans une transaction DB. Extrait verbatim de
 * AdminEcheancesController.triggerPayment (SOLID vague 4).
 *
 * L'autorisation (`assertPay`) reste portée par le contrôleur.
 */
@Injectable()
export class TriggerEcheancePaymentUseCase {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async execute(
    projectId: string,
    numero: number,
    admin: ActiveUser,
  ): Promise<{ paidCount: number; totalAmount: number; skipped: number }> {
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
            message: `Vous avez reçu ${formatEur(montant)} sur votre wallet (échéance ${numero} du projet).`,
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
        message: `Admin a déclenché l'échéance ${numero} : ${paidCount} investisseur(s) crédité(s) pour ${formatEur(totalAmount)}.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: { projectId, numero, paidCount, totalAmount, triggeredBy: admin.userId },
      })
      .catch(() => {});

    return { paidCount, totalAmount, skipped };
  }
}
