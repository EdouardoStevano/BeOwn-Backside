import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EcheanceEntity } from '../../infrastructure/persistence/entities/echeance.entity';
import { InvestmentOrmMapper } from '../../infrastructure/persistence/mappers/investment.orm-mapper';
import { Echeance } from '../../domain/entities/echeance';
import { EcheanceStatus } from '../../domain/enums/investment-status.enum';
import { EcheancePayeeDomainEvent } from '../../domain/events/echeance-payee.domain-event';
import {
  EcheanceDejaPayeeError,
  EcheanceIntrouvableError,
  WalletInvestisseurIntrouvableError,
} from '../../domain/errors/subscription.errors';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/iam/domain/enums/user.enum';

/**
 * **Payer une échéance** — l'émetteur verse un coupon : l'investisseur est
 * crédité du net, la retenue à la source part vers les wallets séquestres.
 *
 * Le use case orchestre, il ne décide pas (§14) : la payabilité de l'échéance
 * et le calcul du PFU vivent dans {@link Echeance.payer} et
 * {@link PrelevementForfaitaire}. La liste des statuts payables et les taux
 * fiscaux (12,8 % + 17,2 %) étaient écrits ici, en constantes de module et en
 * quatre lignes d'arithmétique au milieu du règlement.
 *
 * L'atomicité (correctif H-C, double-crédit au retry du CRON) est inchangée :
 *
 *  1. le domaine décide, puis un CLAIM conditionnel (`WHERE statut IN
 *     (payables)`, `affected === 1`) rejoue cette décision en base AVANT tout
 *     crédit ;
 *  2. les wallets (investisseur + séquestres IR/CSG) sont crédités par SQL
 *     ATOMIQUE (`solde + :x`), jamais en read-modify-write ;
 *  3. les 3 traces ledger (net, IR, CSG) sont insérées dans la même
 *     transaction.
 *
 * Une panne partielle annule TOUT (rollback) → l'échéance reste payable et le
 * prochain run du CRON peut la rejouer sans double-créditer. Un succès committe
 * l'échéance en `PAYE`, qui n'est plus payable → idempotent.
 */
@Injectable()
export class PayEcheanceUseCase {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationEvents: NotificationEventService,
    private readonly auditLog: AuditLogService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    echeanceId: string,
    adminId: number,
    adminRole?: string,
  ): Promise<EcheanceEntity> {
    const settled = await this.dataSource.transaction(async (em) => {
      const row = await em.findOne(EcheanceEntity, {
        where: { id: echeanceId },
        relations: ['investissement', 'investissement.projet'],
      });
      if (!row) throw new EcheanceIntrouvableError(echeanceId);

      // 1. Le domaine tranche la payabilité et calcule la retenue à la source.
      const echeance = InvestmentOrmMapper.echeanceToDomain(row);
      const prelevement = echeance.payer();
      const { prelevementIR, prelevementCSG, montantNet } = prelevement;

      const userId = (row as any).investissement.utilisateurId;
      const project = (row as any).investissement.projet;
      const projetId = (row as any).investissement.projetId;

      // 2. CLAIM atomique — même décision, rejouée en base AVANT tout crédit.
      const payeLe = echeance.payeLe ?? new Date();
      const claim = await em
        .createQueryBuilder()
        .update(EcheanceEntity)
        .set({
          statut: EcheanceStatus.PAYE,
          payeLe,
          statutChangeLe: payeLe,
          prelevementIR,
          prelevementCSG,
        })
        .where('id = :id AND statut IN (:...payables)', {
          id: echeanceId,
          payables: Echeance.STATUTS_PAYABLES,
        })
        .execute();
      if (!claim.affected) {
        // Un run concurrent a déjà payé cette échéance.
        throw new EcheanceDejaPayeeError();
      }

      // 3. Crédit ATOMIQUE du wallet investisseur (net).
      const wallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      });
      if (!wallet) throw new WalletInvestisseurIntrouvableError();
      await this.crediterAtomiquement(em, wallet.id, montantNet);

      // 4. Séquestres fiscaux (créés à la première utilisation).
      const walletIR = await this.sequestre(
        em,
        WalletType.SEQUESTRE_IR,
        'SEQUESTRE-IR',
        wallet.devise,
      );
      await this.crediterAtomiquement(em, walletIR.id, prelevementIR);

      const walletCSG = await this.sequestre(
        em,
        WalletType.SEQUESTRE_CSG,
        'SEQUESTRE-CSG',
        wallet.devise,
      );
      await this.crediterAtomiquement(em, walletCSG.id, prelevementCSG);

      // 5. Traces ledger (net investisseur + IR + CSG), idempotency-keyées.
      await this.tracer(em, {
        walletDestination: wallet.id,
        type: TransactionType.PAIEMENT_INTERETS,
        montant: montantNet,
        devise: wallet.devise,
        echeance: row,
        projetId,
        idempotencyKey: `echeance:pay:${row.id}`,
      });
      await this.tracer(em, {
        walletDestination: walletIR.id,
        type: TransactionType.IMPOTS,
        montant: prelevementIR,
        devise: wallet.devise,
        echeance: row,
        projetId,
        idempotencyKey: `echeance:ir:${row.id}`,
      });
      await this.tracer(em, {
        walletDestination: walletCSG.id,
        type: TransactionType.IMPOTS,
        montant: prelevementCSG,
        devise: wallet.devise,
        echeance: row,
        projetId,
        idempotencyKey: `echeance:csg:${row.id}`,
      });

      // La ligne renvoyée reflète l'état payé : ses relations sont déjà
      // chargées, ce dont la notification a besoin.
      Object.assign(row, echeance.snapshot());

      return {
        row,
        project,
        projetId,
        montantNet,
        prelevementIR,
        prelevementCSG,
      };
    });

    // ── Effets de bord APRÈS commit (non bloquants pour le règlement) ────────
    this.eventBus.publish(
      new EcheancePayeeDomainEvent(
        settled.row.id,
        settled.row.investissementId,
        settled.projetId,
        settled.montantNet,
        settled.prelevementIR,
        settled.prelevementCSG,
      ),
    );

    try {
      await this.notificationEvents.echeancePaid(settled.row, settled.project);
    } catch {
      // notification non bloquante
    }
    await this.auditLog
      .create(
        String(adminId),
        adminRole ?? UserRole.SUPER_ADMIN,
        'echeance.pay',
        'echeance',
        settled.row.id,
        undefined,
        undefined,
        {
          montantNet: settled.montantNet,
          prelevementIR: settled.prelevementIR,
          prelevementCSG: settled.prelevementCSG,
          projetId: settled.project?.id,
        },
      )
      .catch(() => undefined);

    return settled.row;
  }

  /** Crédit atomique d'un wallet (no-op si delta nul). */
  private async crediterAtomiquement(
    em: EntityManager,
    walletId: string,
    montant: number,
  ): Promise<void> {
    if (!montant) return;
    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde + :amount' })
      .setParameter('amount', montant)
      .where('id = :id', { id: walletId })
      .execute();
  }

  /** Récupère (ou crée) un wallet séquestre system-wide. */
  private async sequestre(
    em: EntityManager,
    type: WalletType,
    fournisseurRef: string,
    devise: string,
  ): Promise<WalletEntity> {
    const existant = await em.findOne(WalletEntity, { where: { type } });
    if (existant) return existant;
    return em.save(
      WalletEntity,
      em.create(WalletEntity, {
        type,
        proprietaireUserId: null,
        fournisseurRef,
        devise,
        solde: 0,
      }),
    );
  }

  private async tracer(
    em: EntityManager,
    trace: {
      walletDestination: string;
      type: TransactionType;
      montant: number;
      devise: string;
      echeance: EcheanceEntity;
      projetId: string;
      idempotencyKey: string;
    },
  ): Promise<void> {
    await em.save(
      TransactionEntity,
      em.create(TransactionEntity, {
        walletDestination: trace.walletDestination,
        type: trace.type,
        montant: trace.montant,
        devise: trace.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        echeanceId: trace.echeance.id,
        investissementId: trace.echeance.investissementId,
        projetId: trace.projetId,
        idempotencyKey: trace.idempotencyKey,
        fraisPsp: 0,
        fraisPlateforme: 0,
      }),
    );
  }
}
