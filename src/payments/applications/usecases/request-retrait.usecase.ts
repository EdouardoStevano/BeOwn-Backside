import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { formatEur } from 'src/common/money/format-eur';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { CreateRetraitDto } from '../../presenters/dto/payment.dto';
import {
  StripeConnectService,
  type ConnectAccountStatus,
} from '../../infrastructure/stripe-connect.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import {
  PayoutDestinationResolver,
  type ResolvedPayoutDestination,
} from '../services/payout-destination.resolver';

/**
 * Cas d'usage « demande de retrait » (extrait de PaymentController — SRP).
 * Contient toute la logique financière du retrait investisseur :
 *  - aiguillage Stripe Connect (E3) vs legacy manuel (secours) ;
 *  - débit atomique du wallet + création de la transaction RETRAIT ;
 *  - recrédit idempotent en cas d'échec (partagé avec le webhook payout.failed).
 *
 * Comportement strictement identique à l'implémentation d'origine du contrôleur.
 */
@Injectable()
export class RequestRetraitUseCase {
  private readonly logger = new Logger(RequestRetraitUseCase.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly stripeConnect: StripeConnectService,
    private readonly notificationService: NotificationService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly metrics: MetricsPort,
    // Lot 4a — décide et VALIDE la destination du versement avant tout débit.
    private readonly destinationResolver: PayoutDestinationResolver,
  ) {}

  async execute(dto: CreateRetraitDto, user: ActiveUser) {
    // ── Idempotence explicite (L-2) ──────────────────────────────────────────
    // Si le client fournit une clé, une resoumission de la même demande renvoie
    // le retrait déjà enregistré au lieu d'en créer un second.
    if (dto.idempotencyKey) {
      const existing = await this.txRepo.findOne({
        where: { idempotencyKey: `retrait:${user.userId}:${dto.idempotencyKey}` },
      });
      if (existing) {
        return {
          success: true,
          transactionId: existing.id,
          status: existing.statut,
          alreadyProcessed: true,
        };
      }
    }

    // ── Aiguillage E3 : Stripe Connect vs legacy manuel (secours) ────────────
    // Statut du compte connecté (best-effort : un incident Stripe ne doit pas
    // empêcher le fallback legacy). Le retrait Connect n'est autorisé que si le
    // compte a `payouts_enabled`.
    let connect: ConnectAccountStatus = {
      connected: false,
      accountId: null,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    };
    try {
      connect = await this.stripeConnect.getAccountStatus(user.userId);
    } catch (err) {
      this.logger.warn(
        `Retrait: statut Connect indisponible userId=${user.userId}: ${err?.message}`,
      );
    }

    if (connect.payoutsEnabled && connect.accountId) {
      // Lot 4a — validation de la destination AVANT tout débit du wallet :
      // appartenance de la carte au compte connecté, éligibilité au virement
      // instantané, bornes de montant. Lève un `PayoutMethodError` typé (traduit
      // en 4xx par PayoutMethodExceptionFilter) sans qu'aucun euro n'ait bougé.
      const destination = await this.destinationResolver.resolve({
        connectedAccountId: connect.accountId,
        amount: Number(dto.amount),
        payoutMethodId: dto.payoutMethodId,
        method: dto.method,
      });
      return this.executeConnectRetrait(user, dto, connect.accountId, destination);
    }

    // Fallback legacy (traitement manuel admin). Nécessite un IBAN ; sinon on
    // invite l'investisseur à connecter son compte de retrait Stripe.
    if (!dto.ibanDestination) {
      return {
        success: false,
        code: 'CONNECT_NOT_READY',
        message:
          'Connectez votre compte de retrait Stripe pour effectuer un retrait.',
      };
    }
    return this.executeLegacyRetrait(user, dto);
  }

  /**
   * Débit atomique du wallet + création de la transaction RETRAIT. Verrou
   * pessimiste + décrément CONDITIONNEL (`solde >= amount`) dans une seule
   * transaction DB : deux retraits concurrents ne peuvent pas passer tous deux
   * un contrôle sur une lecture obsolète (anti double-débit / solde négatif).
   */
  private async openRetraitTransaction(
    user: ActiveUser,
    dto: CreateRetraitDto,
    initialStatus: TransactionStatus,
    metadata: Record<string, unknown>,
  ): Promise<{ ok: true; tx: TransactionEntity } | { ok: false; message: string }> {
    return this.dataSource.transaction(async (manager) => {
      // Wallet source : soit l'id fourni (retrait legacy/admin), soit — quand le
      // front n'envoie que le montant (parcours Stripe Connect) — le wallet
      // INVESTISSEUR de l'utilisateur authentifié. Toujours scopé par
      // proprietaireUserId (anti-BOLA).
      const walletRow = await manager.findOne(WalletEntity, {
        where: dto.walletId
          ? { id: dto.walletId, proprietaireUserId: user.userId }
          : { proprietaireUserId: user.userId, type: WalletType.INVESTISSEUR },
        lock: { mode: 'pessimistic_write' },
      });
      if (!walletRow) {
        return { ok: false as const, message: 'Wallet introuvable' };
      }

      const upd = await manager
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde - :amount' })
        .setParameter('amount', dto.amount)
        .where('id = :id AND solde >= :amount', {
          id: walletRow.id,
          amount: dto.amount,
        })
        .execute();
      if (!upd.affected) {
        return { ok: false as const, message: 'Solde insuffisant' };
      }

      const idempotencyKey = dto.idempotencyKey
        ? `retrait:${user.userId}:${dto.idempotencyKey}`
        : `retrait:${user.userId}:${randomUUID()}`;

      const tx = await manager.save(
        manager.create(TransactionEntity, {
          walletId: walletRow.id,
          type: TransactionType.RETRAIT,
          montant: dto.amount,
          devise: dto.currency,
          statut: initialStatus,
          fournisseur: TransactionFournisseur.STRIPE,
          fournisseurRef: dto.ibanDestination ?? null,
          idempotencyKey,
          metadata,
        }),
      );

      return { ok: true as const, tx };
    });
  }

  /**
   * Recrédit idempotent d'un retrait échoué. Reprend le verrou pessimiste et
   * ne recrédite QU'UNE fois : un `metadata.recredited === true` ou un statut
   * terminal (ECHOUE/REMBOURSE/ANNULE) rend l'appel no-op. Garantit qu'un
   * échec synchrone (transfer KO) ET un webhook payout.failed ne peuvent pas
   * recréditer deux fois le même retrait.
   *
   * Public : appelé aussi par le webhook `payout.failed` (PaymentController).
   */
  async recreditRetrait(
    txId: string,
    reason: string,
    finalStatus: TransactionStatus,
  ): Promise<'recredited' | 'noop'> {
    return this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(TransactionEntity, {
        where: { id: txId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tx || tx.type !== TransactionType.RETRAIT) return 'noop' as const;

      const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      const alreadyRecredited =
        meta.recredited === true ||
        tx.statut === TransactionStatus.ECHOUE ||
        tx.statut === TransactionStatus.REMBOURSE ||
        tx.statut === TransactionStatus.ANNULE;
      if (alreadyRecredited) return 'noop' as const;

      if (tx.walletId) {
        await manager
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :amount' })
          .setParameter('amount', tx.montant)
          .where('id = :id', { id: tx.walletId })
          .execute();
      }

      tx.statut = finalStatus;
      tx.motifEchec = reason;
      tx.metadata = {
        ...meta,
        recredited: true,
        recreditReason: reason,
        recreditedAt: new Date().toISOString(),
      };
      await manager.save(tx);
      return 'recredited' as const;
    });
  }

  /**
   * Retrait via Stripe Connect Express :
   *  1. débit atomique du wallet → transaction EN_COURS ;
   *  2. Transfer plateforme → compte connecté (idempotent) ;
   *  3. Payout compte connecté → destination (carte ou IBAN).
   * En cas d'échec du transfer, rollback intégral (recrédit + ECHOUE). Le
   * passage à REUSSI est finalisé par le webhook `payout.paid`.
   *
   * Lot 4a — `destination` porte le choix de l'investisseur :
   *  - `explicit = false` (parcours historique) : le payout est créé sans
   *    `method` ni `destination` et son échec reste best-effort (le compte
   *    Express verse automatiquement) ;
   *  - `explicit = true` : l'échec du payout n'est PAS acceptable — les fonds
   *    partiraient vers la mauvaise destination — donc rollback complet
   *    (reversal du transfert + recrédit du wallet).
   */
  private async executeConnectRetrait(
    user: ActiveUser,
    dto: CreateRetraitDto,
    connectedAccountId: string,
    destination: ResolvedPayoutDestination,
  ) {
    const metricMethod = destination.method === 'instant'
      ? 'stripe_connect_instant'
      : 'stripe_connect';

    const opened = await this.openRetraitTransaction(user, dto, TransactionStatus.EN_COURS, {
      method: 'stripe_connect',
      connectedAccountId,
      userId: user.userId,
      ...(destination.explicit
        ? {
            payoutMethodId: destination.payoutMethodId,
            payoutMethod: destination.method,
          }
        : {}),
    });
    if (!opened.ok) {
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
        method: metricMethod,
        result: 'rejected',
      });
      // Forme historique conservée telle quelle (INSUFFICIENT_FUNDS "existant") :
      // `payment.controller.security.spec.ts` verrouille exactement ce contrat.
      return { success: false, message: opened.message };
    }
    const tx = opened.tx;
    let baseMeta: Record<string, unknown> = (tx.metadata ?? {}) as Record<string, unknown>;

    // 2. Transfer plateforme → compte connecté (idempotent).
    let transferId: string;
    try {
      transferId = await this.stripeConnect.createTransfer({
        amountMajor: dto.amount,
        currency: dto.currency,
        destinationAccountId: connectedAccountId,
        idempotencyKey: `retrait-transfer:${tx.id}`,
        metadata: { retraitTxId: tx.id, userId: String(user.userId) },
      });
    } catch (err) {
      // Aucun fonds n'a bougé → rollback intégral du débit wallet.
      this.logger.error(`Retrait Connect: transfer échoué tx=${tx.id}: ${err?.message}`);
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_TRANSFER_FAILED_TOTAL);
      const recreditOutcome = await this.recreditRetrait(
        tx.id,
        `Transfer Stripe échoué: ${err?.message ?? 'inconnu'}`,
        TransactionStatus.ECHOUE,
      );
      if (recreditOutcome === 'recredited') {
        this.metrics.incrementCounter(METRIC.WITHDRAWAL_RECREDITED_TOTAL, {
          trigger: 'transfer_failed',
        });
      }
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
        method: metricMethod,
        result: 'failed',
      });
      this.notifyRetraitEchec(user.userId, Number(dto.amount), tx.id);
      return {
        success: false,
        code: 'TRANSFER_FAILED',
        message: 'Le versement a échoué, votre solde a été recrédité.',
      };
    }

    this.metrics.observeHistogram(METRIC.WITHDRAWAL_AMOUNT_EUR, Number(dto.amount), {
      method: metricMethod,
    });
    baseMeta = { ...baseMeta, transferId };
    await this.txRepo.update(tx.id, { fournisseurRef: transferId, metadata: baseMeta as any });

    // 3. Payout compte connecté → destination.
    let payoutId: string | undefined;
    try {
      payoutId = await this.stripeConnect.createPayoutOnConnectedAccount({
        amountMajor: dto.amount,
        currency: dto.currency,
        connectedAccountId,
        idempotencyKey: `retrait-payout:${tx.id}`,
        metadata: { retraitTxId: tx.id },
        ...(destination.explicit
          ? {
              method: destination.method,
              ...(destination.payoutMethodId
                ? { destination: destination.payoutMethodId }
                : {}),
            }
          : {}),
      });
      baseMeta = { ...baseMeta, payoutId };
      await this.txRepo.update(tx.id, { metadata: baseMeta as any });
    } catch (err) {
      if (!destination.explicit) {
        // Parcours historique : payout manuel refusé (probablement payouts
        // automatiques sur le compte) → on se repose sur le payout automatique
        // Stripe. Le transfert a réussi : NE PAS rollback.
        this.logger.warn(
          `Retrait Connect: payout explicite non créé tx=${tx.id} ` +
          `(payout automatique probable): ${err?.message}`,
        );
      } else {
        // Destination CHOISIE par l'investisseur : laisser les fonds sur le
        // compte connecté les enverrait au versement automatique, donc vers une
        // autre destination que celle demandée. Rollback intégral.
        return this.rollbackAfterPayoutFailure(
          user,
          dto,
          tx.id,
          transferId,
          metricMethod,
          err,
        );
      }
    }

    this.notificationService
      .push({
        utilisateurId: user.userId,
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Retrait en cours',
        message: `Votre retrait de ${formatEur(Number(dto.amount))} est en cours d'acheminement vers votre compte bancaire.`,
        metadata: { transactionId: tx.id, transferId, payoutId },
      })
      .catch(() => {});

    this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
      method: metricMethod,
      result: 'success',
    });
    return {
      success: true,
      transactionId: tx.id,
      status: tx.statut,
      transferId,
      payoutId,
      ...(destination.explicit
        ? {
            payoutMethodId: destination.payoutMethodId,
            payoutMethod: destination.method,
          }
        : {}),
    };
  }

  /**
   * Rollback d'un retrait dont le payout vers une destination CHOISIE a échoué
   * de façon synchrone alors que le Transfer avait réussi.
   *
   * Ordre imposé : rapatrier d'abord les fonds vers la plateforme (reversal du
   * transfert) PUIS recréditer le wallet. Recréditer sans reversal réussi
   * double-créditerait l'investisseur (fonds encore sur le compte connecté) —
   * dans ce cas on n'écrit rien et on escalade aux admins, exactement comme le
   * webhook `payout.failed`.
   */
  private async rollbackAfterPayoutFailure(
    user: ActiveUser,
    dto: CreateRetraitDto,
    txId: string,
    transferId: string,
    metricMethod: string,
    cause: any,
  ) {
    this.logger.error(
      `Retrait Connect: payout vers destination choisie refusé tx=${txId} ` +
      `code=${cause?.code ?? 'n/a'}: ${cause?.message ?? 'inconnu'}`,
    );

    try {
      await this.stripeConnect.reverseTransfer(
        transferId,
        `retrait-reverse:${txId}`,
      );
    } catch (reversalErr: any) {
      // Aucun recrédit à l'aveugle : les fonds sont toujours sur le compte
      // connecté. Revue manuelle.
      this.logger.error(
        `Retrait Connect: reversal impossible après payout refusé tx=${txId} ` +
        `transfer=${transferId}: ${reversalErr?.message}`,
      );
      this.notificationService
        .pushToAdmins({
          type: NotificationType.RETRAIT_TRAITE,
          titre: 'Retrait — payout refusé et reversal échoué, revue manuelle',
          message:
            `Le payout du retrait ${txId} a été refusé et le reversal du transfert ` +
            `n'a pas abouti. Vérifier l'état Stripe avant tout recrédit manuel.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
          metadata: { transactionId: txId, transferId },
        })
        .catch(() => {});
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
        outcome: 'failed',
        reversal: 'reversal_failed',
      });
      return {
        success: false,
        code: 'PAYOUT_FAILED',
        message:
          'Le versement n\'a pas pu être effectué. Notre équipe vérifie votre demande.',
      };
    }

    const outcome = await this.recreditRetrait(
      txId,
      `Payout Stripe refusé: ${cause?.message ?? 'inconnu'}`,
      TransactionStatus.ECHOUE,
    );
    if (outcome === 'recredited') {
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_RECREDITED_TOTAL, {
        trigger: 'payout_rejected',
      });
    }
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
      outcome: 'failed',
      reversal: 'reversal_ok',
    });
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
      method: metricMethod,
      result: 'failed',
    });
    this.notifyRetraitEchec(user.userId, Number(dto.amount), txId);

    // Message utilisateur générique : la cause Stripe reste dans les logs et
    // dans `motifEchec`, jamais renvoyée au client.
    return {
      success: false,
      code: 'CARD_REJECTED',
      message:
        'Le versement vers cette destination a été refusé. Votre solde a été recrédité.',
    };
  }

  /**
   * Retrait legacy (secours) : débite le wallet et laisse le retrait en
   * attente d'un traitement manuel admin (AdminRetraitsController). Conservé
   * tant que Stripe Connect n'est pas validé en staging.
   */
  private async executeLegacyRetrait(user: ActiveUser, dto: CreateRetraitDto) {
    const opened = await this.openRetraitTransaction(
      user,
      dto,
      TransactionStatus.EN_ATTENTE_PAIEMENT,
      { method: 'legacy_manuel', ibanDestination: dto.ibanDestination, userId: user.userId },
    );
    if (!opened.ok) {
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
        method: 'legacy_manuel',
        result: 'rejected',
      });
      return { success: false, message: opened.message };
    }
    const tx = opened.tx;
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
      method: 'legacy_manuel',
      result: 'success',
    });
    this.metrics.observeHistogram(METRIC.WITHDRAWAL_AMOUNT_EUR, Number(dto.amount), {
      method: 'legacy_manuel',
    });

    this.notificationService
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Nouvelle demande de retrait',
        message: `L'utilisateur #${user.userId} a demandé un retrait de ${dto.amount} ${dto.currency} vers ${dto.ibanDestination}.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          userId: user.userId,
          transactionId: tx.id,
          amount: dto.amount,
          currency: dto.currency,
          ibanDestination: dto.ibanDestination,
        },
      })
      .catch(() => {});

    return { success: true, transactionId: tx.id, status: tx.statut };
  }

  /**
   * Notifie l'investisseur d'un échec de retrait (solde recrédité).
   * Public : appelé aussi par le webhook `payout.failed` (PaymentController).
   */
  notifyRetraitEchec(userId: number, montant: number, txId: string): void {
    this.notificationService
      .push({
        utilisateurId: userId,
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Retrait échoué — solde recrédité',
        message: `Votre retrait de ${formatEur(montant)} n'a pas pu être effectué. Le montant a été recrédité sur votre wallet.`,
        metadata: { transactionId: txId },
      })
      .catch(() => {});
  }
}
