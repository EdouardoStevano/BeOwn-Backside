import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { InvestmentStatus, EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';
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
import { formatEur } from 'src/common/money/format-eur';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/** Investissements remboursables (fonds engagés, ni rétractés ni déjà annulés). */
const REFUNDABLE_INVESTMENT_STATUSES = [
  InvestmentStatus.CONFIRME,
  InvestmentStatus.EN_DELAI_RETRACTATION,
  InvestmentStatus.SIGNE,
  InvestmentStatus.PAYE,
  InvestmentStatus.ADEQUATION_OK,
  InvestmentStatus.PAIEMENT_ATTENDU,
];

export interface RefundResult {
  refundedCount: number;
  refundedAmount: number;
}

/**
 * Remboursement intégral de la collecte d'un projet — mécanisme « tout ou rien »
 * du crowdfunding : si l'objectif minimum n'est pas atteint (ou si l'admin
 * annule), les fonds sont recrédités aux investisseurs et les échéances
 * obligataires annulées. Réutilisé par le CRON de clôture et l'action admin.
 */
@Injectable()
export class RefundCollecteService {
  private readonly logger = new Logger(RefundCollecteService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsPort,
  ) {}

  /**
   * Rembourse tous les investisseurs d'un projet et passe celui-ci dans le
   * statut cible (ECHEC pour une collecte ratée, ANNULE pour une annulation
   * admin). Opération atomique.
   */
  async refundProjectCollecte(
    projectId: string,
    options: {
      targetStatus: string;
      reason?: string | null;
      triggeredByUserId?: number | null;
    },
  ): Promise<RefundResult> {
    return this.dataSource.transaction(async (manager) => {
      // Correctif M-3 — verrou pessimiste sur la ligne projet : sérialise deux
      // déclenchements concurrents (CRON de clôture + annulation admin) qui,
      // sinon, liraient tous deux le même lot d'investissements avant tout
      // commit et rembourseraient deux fois.
      const project = await manager.findOne(ProjectEntity, {
        where: { id: projectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!project) {
        throw new Error(`Projet ${projectId} introuvable pour remboursement.`);
      }

      // Garde d'idempotence : si le projet est déjà dans le statut terminal
      // visé (remboursement déjà effectué par un run précédent), no-op.
      if ((project as any).statut === options.targetStatus) {
        this.logger.log(
          `Projet ${projectId} déjà en statut "${options.targetStatus}" — remboursement ignoré (idempotent).`,
        );
        return { refundedCount: 0, refundedAmount: 0 };
      }

      const investments = await manager.find(InvestmentEntity, {
        where: {
          projetId: projectId,
          statut: In(REFUNDABLE_INVESTMENT_STATUSES),
        },
      });

      let refundedCount = 0;
      let refundedAmount = 0;

      for (const inv of investments) {
        const amount = Number(inv.montant);
        const wallet = await this.creditInvestorWallet(
          manager,
          inv.utilisateurId,
          amount,
        );

        const tx = manager.create(TransactionEntity, {
          walletSource: null,
          walletDestination: wallet.id,
          montant: amount,
          devise: wallet.devise ?? 'EUR',
          type: TransactionType.REMBOURSEMENT_COLLECTE_ECHEC,
          fournisseur: TransactionFournisseur.INTERNE,
          statut: TransactionStatus.REUSSI,
          investissementId: inv.id,
          projetId: project.id,
          metadata: {
            reason: options.reason ?? null,
            triggeredBy: options.triggeredByUserId ?? 'system',
          },
        } as Partial<TransactionEntity>);
        await manager.save(tx);

        // Annule les échéances obligataires non encore payées
        await manager.update(
          EcheanceEntity,
          {
            investissementId: inv.id,
            statut: In([EcheanceStatus.A_VENIR, EcheanceStatus.EN_ATTENTE_PAIEMENT]),
          },
          { statut: EcheanceStatus.ANNULE },
        );

        await manager.update(
          InvestmentEntity,
          { id: inv.id },
          { statut: InvestmentStatus.ANNULE },
        );

        try {
          await this.notifications.push({
            utilisateurId: inv.utilisateurId,
            type: NotificationType.AUTRE,
            titre: `Collecte non aboutie : ${project.titre}`,
            message:
              `L'objectif de collecte n'a pas été atteint. ` +
              `${formatEur(amount)} ont été intégralement recrédités sur votre wallet.` +
              (options.reason ? ` Motif : ${options.reason}` : ''),
            metadata: {
              projectId: project.id,
              projectSlug: project.slug,
              amount,
              reason: options.reason ?? null,
            },
          });
        } catch {
          // Notification non bloquante
        }

        refundedCount += 1;
        refundedAmount += amount;
      }

      await manager.update(
        ProjectEntity,
        { id: projectId },
        {
          statut: options.targetStatus,
          motifAnnulation: options.reason ?? null,
          annuleLe: new Date(),
        } as never,
      );

      this.logger.log(
        `Projet ${projectId} → ${options.targetStatus} : ${refundedCount} investisseur(s) remboursé(s) pour ${formatEur(refundedAmount)}`,
      );

      if (refundedAmount > 0) {
        this.metrics.observeHistogram(METRIC.COLLECTE_REFUND_AMOUNT_EUR, refundedAmount, {
          trigger: options.targetStatus === 'ANNULE' ? 'admin_annulation' : 'cron_echec',
        });
      }

      return { refundedCount, refundedAmount };
    });
  }

  private async creditInvestorWallet(
    manager: EntityManager,
    userId: number,
    amount: number,
  ): Promise<WalletEntity> {
    let wallet = await manager.findOne(WalletEntity, {
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) {
      wallet = manager.create(WalletEntity, {
        proprietaireUserId: userId,
        type: WalletType.INVESTISSEUR,
        devise: 'EUR',
        solde: 0,
      } as Partial<WalletEntity>);
      wallet = await manager.save(wallet);
    }
    await manager
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde + :amount' })
      .setParameter('amount', amount)
      .where('id = :id', { id: wallet.id })
      .execute();
    return wallet;
  }
}
