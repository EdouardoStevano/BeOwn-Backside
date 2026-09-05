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
import { formatEur } from 'src/shared/money/format-eur';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { CreateRetraitDto } from '../../presenters/dto/payment.dto';
import {
  StripeConnectService,
  type ConnectAccountStatus,
} from '../../infrastructure/stripe-connect.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import {
  PayoutDestinationResolver,
  type ResolvedPayoutDestination,
} from '../services/payout-destination.resolver';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';
import { GelDesAvoirsPort } from 'src/common/aml/gel-des-avoirs.port';

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
    private readonly amlMonitor: AmlMonitorService,
    // Gel des avoirs (L. 562-4 CMF) — port DIP, en dernière position (les
    // specs construisent ce usecase à la main).
    private readonly gelDesAvoirs: GelDesAvoirsPort,
  ) {}

  async execute(dto: CreateRetraitDto, user: ActiveUser) {
    // ── Gel des avoirs — AVANT tout, y compris le rejeu idempotent ───────────
    // Le retrait est LE chemin par lequel les fonds quittent la plateforme :
    // un compte gelé n'obtient ni nouveau retrait ni relecture d'une demande
    // antérieure. Refus 403 AVOIRS_GELES (docs/adr/ADR-gel-des-avoirs.md).
    await this.gelDesAvoirs.assertAvoirsNonGeles(user.userId);

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

    // ── Vigilance LCB-FT (art. L.561-10 CMF) ─────────────────────────────────
    // Le retrait est le mouvement le plus sensible du dispositif : c'est par
    // lui que des fonds quittent la plateforme. Le contrôle est déclenché dès
    // la DEMANDE — pas au versement — pour que compliance voie l'opération
    // avant qu'elle ne soit acheminée. Il n'est ni attendu ni bloquant : une
    // alerte relève de la vigilance, pas du gel des avoirs.
    this.amlMonitor
      .check({
        userId: user.userId,
        amount: Number(dto.amount),
        context: 'retrait',
      })
      .catch((err) =>
        this.logger.warn(
          `Contrôle LCB-FT du retrait impossible pour l'utilisateur #${user.userId}: ${err?.message}`,
        ),
      );

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

      // ANO-02 : le portefeuille est DÉBITÉ → `walletSource`. La destination
      // est le compte bancaire du bénéficiaire, hors plateforme, donc NULL.
      const tx = await manager.save(
        manager.create(TransactionEntity, {
          walletSource: walletRow.id,
          walletDestination: null,
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

      if (tx.walletSource) {
        await manager
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :amount' })
          .setParameter('amount', tx.montant)
          .where('id = :id', { id: tx.walletSource })
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
      this.logger.error(`Retrait Connect: transfer échoué tx=${tx.id}: ${err?.message}`);
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_TRANSFER_FAILED_TOTAL);

      // B6 — NE JAMAIS RECRÉDITER SUR UNE ERREUR INDÉCISE.
      //
      // Le recrédit était inconditionnel : toute exception valait « l'argent
      // n'est pas parti ». C'est vrai d'un REFUS explicite du prestataire ;
      // c'est faux d'un délai dépassé ou d'une coupure réseau, où l'ordre a pu
      // être exécuté sans que la réponse nous parvienne. Recréditer dans ce
      // cas, c'est PAYER DEUX FOIS : une fois vers la banque du client, une
      // fois sur son solde.
      //
      // On ne devine pas : on va VOIR chez le prestataire si le transfert
      // existe (même sonde que `RetraitSettlementService`), et on ne recrédite
      // que si l'échec est décisif ET qu'aucun transfert n'a été retrouvé.
      const doute = await this.transfertPeutExister(err, tx.id, connectedAccountId);
      if (doute) {
        await this.marquerEnVerification(tx, user.userId, dto, err, doute);
        this.metrics.incrementCounter(METRIC.WITHDRAWAL_REQUESTS_TOTAL, {
          method: metricMethod,
          result: 'verification',
        });
        return {
          success: false,
          code: 'TRANSFER_UNCERTAIN',
          message:
            'Le statut de votre virement est en cours de vérification. ' +
            'Votre solde reste inchangé le temps de la levée de doute ; ' +
            'nos équipes reviennent vers vous.',
        };
      }

      // Échec DÉCISIF et aucun transfert retrouvé → rollback intégral.
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

  /**
   * L'échec du transfert laisse-t-il un DOUTE sur le fait que l'argent soit
   * parti ? Rend `null` quand on peut affirmer que non.
   *
   * Deux familles d'erreurs, et une seule autorise le recrédit :
   *  - DÉCISIVE — le prestataire a répondu et a REFUSÉ (requête invalide,
   *    solde de plateforme insuffisant, compte inéligible). L'ordre n'existe
   *    pas : le recrédit est légitime.
   *  - INDÉCISE — délai dépassé, coupure réseau, 5xx. La requête a pu être
   *    exécutée sans que la réponse revienne.
   *
   * Même sur une erreur décisive, on vérifie qu'aucun transfert ne porte notre
   * identifiant : une réponse d'erreur reçue APRÈS exécution reste possible,
   * et c'est la seule preuve qui compte. La sonde est celle du dénouement des
   * webhooks (`RetraitSettlementService`).
   */
  private async transfertPeutExister(
    err: any,
    retraitTxId: string,
    connectedAccountId: string | null,
  ): Promise<{ raison: string; transferId?: string } | null> {
    const transferId = await this.stripeConnect
      .findTransferIdForRetrait({
        retraitTxId,
        destinationAccountId: connectedAccountId,
      })
      .catch(() => null);

    if (transferId) {
      return { raison: 'transfert retrouvé chez le prestataire', transferId };
    }

    if (this.echecDecisif(err)) return null;

    // Erreur indécise ET transfert introuvable : le balayage est BORNÉ (cinq
    // pages) et peut lui-même avoir échoué. On ne tranche pas — un doute non
    // levé vaut mieux qu'un double paiement.
    return {
      raison: `réponse non décisive du prestataire (${err?.type ?? err?.code ?? 'inconnue'})`,
    };
  }

  /** Le prestataire a-t-il explicitement REFUSÉ l'ordre ? */
  private echecDecisif(err: any): boolean {
    const type = String(err?.type ?? '');
    // Types Stripe d'erreurs de REQUÊTE : la requête a été reçue, comprise et
    // rejetée. Tout le reste (connexion, API 5xx, délai) est indécis.
    const typesDecisifs = [
      'StripeInvalidRequestError',
      'StripeCardError',
      'StripeAuthenticationError',
      'StripePermissionError',
      'StripeRateLimitError',
    ];
    if (typesDecisifs.includes(type)) return true;

    // Statut HTTP 4xx (hors 408/429 qui n'excluent pas l'exécution).
    const statut = Number(err?.statusCode ?? err?.raw?.statusCode ?? 0);
    return statut >= 400 && statut < 500 && statut !== 408;
  }

  /**
   * Retrait dont l'issue est inconnue : portefeuille NON recrédité, écriture
   * mise en attente de levée de doute, alerte à l'équipe financière.
   */
  private async marquerEnVerification(
    tx: TransactionEntity,
    userId: number,
    dto: { amount: number; currency: string },
    err: any,
    doute: { raison: string; transferId?: string },
  ): Promise<void> {
    const metadata = {
      ...((tx.metadata ?? {}) as Record<string, unknown>),
      verificationRequise: true,
      verificationRaison: doute.raison,
      verificationLe: new Date().toISOString(),
      ...(doute.transferId ? { transferId: doute.transferId } : {}),
    };

    await this.txRepo
      .update(tx.id, {
        statut: TransactionStatus.EN_VERIFICATION,
        motifEchec: `Issue inconnue : ${doute.raison}`,
        metadata: metadata as any,
        ...(doute.transferId ? { fournisseurRef: doute.transferId } : {}),
      })
      .catch((echec: any) =>
        this.logger.error(
          `Retrait ${tx.id} : passage en vérification NON écrit — ${echec?.message}`,
        ),
      );

    this.logger.error(
      `Retrait ${tx.id} EN VÉRIFICATION (aucun recrédit) : ${doute.raison}. ` +
        `Erreur d'origine : ${err?.message ?? 'inconnue'}`,
    );

    this.notificationService
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Retrait à vérifier — issue inconnue',
        message:
          `Le retrait ${tx.id} (${formatEur(Number(dto.amount))}, utilisateur #${userId}) ` +
          `n'a pas reçu de réponse décisive du prestataire : ${doute.raison}. ` +
          'Le solde N\'A PAS été recrédité, pour ne pas risquer un double paiement. ' +
          'Vérifier chez le prestataire, puis dénouer manuellement.',
        roles: [UserRole.FINANCIER, UserRole.SUPER_ADMIN],
        metadata: {
          transactionId: tx.id,
          userId,
          montant: dto.amount,
          raison: doute.raison,
          transferId: doute.transferId ?? null,
        },
      })
      .catch(() => {});
  }
}
