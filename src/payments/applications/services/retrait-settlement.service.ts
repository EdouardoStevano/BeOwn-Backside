import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { formatEur } from 'src/shared/money/format-eur';
import { TransactionalEmailNotifier } from 'src/shared/email/transactional-email.notifier';
import { KIND_VERSEMENT_PORTEUR } from 'src/wallets/applications/project-ledger.service';
import { StripeConnectService } from '../../infrastructure/stripe-connect.service';
import { RequestRetraitUseCase } from '../usecases/request-retrait.usecase';

/** Paramètres du dénouement d'un payout qui n'aboutira pas (échec / annulation). */
export interface OptionsDenouement {
  /** Nom de l'événement à l'origine du dénouement — journalisation seulement. */
  evenement: string;
  motif: string;
  statutFinal: TransactionStatus;
  declencheurMetrique: string;
}

/**
 * Clôture d'un retrait dont le sort est connu chez le prestataire.
 *
 * POURQUOI CE SERVICE EXISTE : la clôture d'un retrait n'appartient pas au
 * webhook. Le webhook n'est qu'un DÉCLENCHEUR parmi d'autres — il peut ne
 * jamais arriver (endpoint injoignable, abonnement expiré, environnement local
 * sans tunnel) et le retrait reste alors `en_cours` indéfiniment alors que
 * l'argent est bel et bien arrivé en banque. Un second déclencheur existe
 * désormais, le balayage de rattrapage (`RetraitsReaperService`), qui interroge
 * le prestataire de sa propre initiative. Les deux doivent clore EXACTEMENT de
 * la même façon : dupliquer la séquence, c'est garantir qu'elle divergera.
 *
 * Toutes les écritures restent IDEMPOTENTES : rejouer une clôture déjà faite
 * (webhook tardif après un balayage, ou l'inverse) est un no-op, jamais un
 * second crédit ni une seconde notification de dénouement.
 */
@Injectable()
export class RetraitSettlementService {
  private readonly logger = new Logger(RetraitSettlementService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly stripeConnect: StripeConnectService,
    private readonly notificationService: NotificationService,
    private readonly metrics: MetricsPort,
    private readonly requestRetrait: RequestRetraitUseCase,
    private readonly transactionalEmails: TransactionalEmailNotifier,
  ) {}

  /**
   * Le payout est arrivé sur le compte bancaire du bénéficiaire. Finalise le
   * retrait (EN_COURS → REUSSI). Idempotent (un retrait déjà REUSSI, ECHOUE ou
   * recrédité est un no-op). Mappé via `payout.metadata.retraitTxId` (posé lors
   * du payout explicite) ; un payout automatique sans metadata est simplement
   * journalisé.
   *
   * @returns `'clos'` si ce passage a effectivement finalisé le retrait,
   *          `'noop'` sinon — ce que le balayage compte comme « déjà traité ».
   */
  async cloturerRetraitPaye(
    payout: any,
    accountId?: string,
  ): Promise<'clos' | 'noop'> {
    const retraitTxId = payout?.metadata?.retraitTxId as string | undefined;
    if (!retraitTxId) {
      this.logger.debug(
        `payout.paid sans retraitTxId (payout automatique) payout=${payout?.id} account=${accountId} — info`,
      );
      return 'noop';
    }

    const tx = await this.txRepo.findOne({ where: { id: retraitTxId } });
    if (!tx || tx.type !== TransactionType.RETRAIT) {
      this.logger.warn(`payout.paid: retrait introuvable txId=${retraitTxId}`);
      return 'noop';
    }
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    if (
      tx.statut === TransactionStatus.REUSSI ||
      tx.statut === TransactionStatus.ECHOUE ||
      meta.recredited === true
    ) {
      return 'noop'; // idempotent / retrait déjà finalisé ou recrédité
    }

    tx.statut = TransactionStatus.REUSSI;
    await this.txRepo.save(tx);
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
      outcome: 'paid',
      reversal: 'false',
    });
    this.logger.log(`Retrait finalisé (payout.paid): tx=${tx.id} payout=${payout?.id}`);

    const userId = meta.userId as number | undefined;
    if (userId) {
      // Le même événement dénoue DEUX mouvements de nature différente : le
      // retrait d'un investisseur sur son propre solde, et le versement à un
      // porteur au titre de son projet. Leur écriture est identique — c'est ce
      // qui permet de partager tout le dénouement durci — mais le message ne
      // peut pas l'être : annoncer « votre retrait » à un porteur qui n'a rien
      // retiré est incompréhensible pour lui.
      const estVersementPorteur = meta.kind === KIND_VERSEMENT_PORTEUR;
      this.notificationService
        .push({
          utilisateurId: userId,
          type: NotificationType.RETRAIT_TRAITE,
          titre: estVersementPorteur ? 'Versement effectué' : 'Retrait effectué',
          message: estVersementPorteur
            ? `Le versement de ${formatEur(Number(tx.montant))} au titre de votre projet a été crédité sur votre compte bancaire.`
            : `Votre retrait de ${formatEur(Number(tx.montant))} a été versé sur votre compte bancaire.`,
          metadata: { transactionId: tx.id, ...(tx.projetId ? { projetId: tx.projetId } : {}) },
        })
        .catch(() => {});
      if (!estVersementPorteur) {
        this.transactionalEmails
          .retraitExecute(userId, Number(tx.montant))
          .catch(() => {});
      }
    }
    return 'clos';
  }

  /**
   * Dénouement d'un payout qui n'aboutira pas (échec ou annulation).
   *
   * ORDRE IMPOSÉ, et c'est tout l'enjeu : rapatrier les fonds vers la
   * plateforme (reversal du transfert) PUIS recréditer le portefeuille.
   * L'inverse — ou l'omission du reversal — laisse l'argent sur le compte
   * connecté ET le remet sur le solde BeOwn : l'investisseur est payé deux
   * fois, et rien dans le système ne le signale.
   *
   * CORRECTIF : l'absence de `metadata.transferId` ne vaut PAS absence de
   * transfert. `createTransfer` peut réussir chez Stripe et l'écriture du
   * `transferId` échouer juste après (coupure, redémarrage). On interroge donc
   * Stripe pour retrouver le transfert avant de conclure quoi que ce soit ;
   * s'il reste introuvable, le retrait part en revue manuelle SANS recrédit —
   * un doute sur la localisation des fonds ne se tranche pas par un automate.
   *
   * Seul le parcours legacy (`method !== 'stripe_connect'`) recrédite sans
   * reversal : aucun euro n'a alors quitté la plateforme.
   *
   * @returns `'compense'` si le portefeuille a été recrédité par cet appel,
   *          `'noop'` dans tous les autres cas (déjà dénoué, revue manuelle,
   *          reversal impossible) — le balayage n'a alors rien à compter.
   */
  async denouerPayoutNonAbouti(
    payout: any,
    accountId: string | undefined,
    options: OptionsDenouement,
  ): Promise<'compense' | 'noop'> {
    const retraitTxId = payout?.metadata?.retraitTxId as string | undefined;

    if (!retraitTxId) {
      this.logger.warn(
        `${options.evenement} sans retraitTxId (payout automatique) payout=${payout?.id} account=${accountId} — revue manuelle`,
      );
      this.notificationService
        .pushToAdmins({
          type: NotificationType.RETRAIT_TRAITE,
          titre: 'Payout Stripe non abouti — revue manuelle',
          message: `Un payout Stripe n'a pas abouti (${options.evenement}, payout=${payout?.id}, compte=${accountId}) sans référence de retrait. Vérifier et recréditer manuellement si besoin.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
          metadata: { payoutId: payout?.id, accountId, evenement: options.evenement },
        })
        .catch(() => {});
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
        outcome: 'failed',
        reversal: 'no_reference',
      });
      return 'noop';
    }

    const tx = await this.txRepo.findOne({ where: { id: retraitTxId } });
    if (!tx || tx.type !== TransactionType.RETRAIT) {
      this.logger.warn(
        `${options.evenement}: retrait introuvable txId=${retraitTxId}`,
      );
      return 'noop';
    }
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    if (meta.recredited === true) {
      this.logger.debug(
        `${options.evenement}: retrait déjà recrédité (idempotent) tx=${tx.id}`,
      );
      return 'noop';
    }
    if (meta.revueManuelle) {
      // Déjà escaladé : les redélivrances Stripe (jusqu'à ~3 jours) ne doivent
      // pas rejouer l'alerte ni tenter un nouveau reversal.
      this.logger.debug(
        `${options.evenement}: retrait déjà en revue manuelle (idempotent) tx=${tx.id}`,
      );
      return 'noop';
    }

    const transferId = await this.resoudreTransfertDuRetrait(tx, meta, options.evenement);
    if (transferId === 'introuvable') return 'noop'; // escaladé, aucun recrédit

    if (transferId) {
      try {
        await this.stripeConnect.reverseTransfer(transferId, `retrait-reverse:${tx.id}`);
      } catch (err: any) {
        this.logger.error(
          `${options.evenement}: reversal du transfert échoué tx=${tx.id} transfer=${transferId}: ${err?.message}`,
        );
        this.notificationService
          .pushToAdmins({
            type: NotificationType.RETRAIT_TRAITE,
            titre: 'Retrait — reversal échoué, revue manuelle',
            message: `Le payout du retrait ${tx.id} n'a pas abouti (${options.evenement}) mais le reversal du transfert n'a pas abouti non plus. Vérifier l'état Stripe avant tout recrédit manuel.`,
            roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
            metadata: { transactionId: tx.id, transferId, payoutId: payout?.id },
          })
          .catch(() => {});
        this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
          outcome: 'failed',
          reversal: 'reversal_failed',
        });
        return 'noop';
      }
    }

    const outcome = await this.requestRetrait.recreditRetrait(
      tx.id,
      options.motif,
      options.statutFinal,
    );
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
      outcome: 'failed',
      reversal: 'reversal_ok',
    });
    if (outcome === 'recredited') {
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_RECREDITED_TOTAL, {
        trigger: options.declencheurMetrique,
      });
      this.logger.log(
        `Retrait recrédité (${options.evenement}): tx=${tx.id}`,
      );
      const userId = meta.userId as number | undefined;
      if (userId) {
        this.requestRetrait.notifyRetraitEchec(userId, Number(tx.montant), tx.id);
      }
      return 'compense';
    }
    return 'noop';
  }

  /**
   * Détermine le transfert à rapatrier avant de recréditer un retrait.
   *
   * @returns l'identifiant du transfert · `undefined` si aucun transfert
   *          n'était nécessaire (parcours legacy : l'argent n'a jamais quitté
   *          la plateforme) · le marqueur `'introuvable'` quand un transfert
   *          était attendu mais reste introuvable — l'appelant doit alors
   *          s'arrêter net.
   */
  private async resoudreTransfertDuRetrait(
    tx: TransactionEntity,
    meta: Record<string, unknown>,
    evenement: string,
  ): Promise<string | undefined | 'introuvable'> {
    const transferId = meta.transferId as string | undefined;
    if (transferId) return transferId;
    if (meta.method !== 'stripe_connect') return undefined;

    const connectedAccountId = meta.connectedAccountId as string | undefined;
    const retrouve = await this.stripeConnect.findTransferIdForRetrait({
      retraitTxId: tx.id,
      destinationAccountId: connectedAccountId ?? null,
    });

    if (retrouve) {
      // Réparation de la trace locale : le transfert existe, la base l'ignorait.
      tx.metadata = { ...meta, transferId: retrouve, transferIdRetrouveLe: new Date().toISOString() };
      await this.txRepo.save(tx);
      this.logger.warn(
        `${evenement}: transferId absent en base mais retrouvé chez Stripe pour tx=${tx.id} (transfer=${retrouve}) — trace réparée.`,
      );
      return retrouve;
    }

    // Aucun transfert retrouvé. Deux mondes possibles : soit l'argent n'est
    // jamais parti (recrédit légitime), soit il est sur le compte connecté et
    // le balayage borné ne l'a pas vu (recrédit = double paiement). On ne
    // tranche pas : revue manuelle.
    this.logger.error(
      `${evenement}: retrait Connect ${tx.id} sans transferId et transfert introuvable chez Stripe ` +
      `(compte=${connectedAccountId ?? 'inconnu'}) — AUCUN recrédit, revue manuelle.`,
    );
    tx.metadata = {
      ...meta,
      revueManuelle: {
        raison: 'transfert_introuvable',
        evenement,
        connectedAccountId: connectedAccountId ?? null,
        detecteLe: new Date().toISOString(),
      },
    };
    await this.txRepo.save(tx);

    this.notificationService
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Retrait — transfert introuvable, revue manuelle',
        message:
          `Le retrait ${tx.id} (${formatEur(Number(tx.montant))}) n'a pas abouti (${evenement}) et aucun transfert Stripe ` +
          `ne lui correspond. Les fonds peuvent être restés sur le compte connecté : le portefeuille n'a PAS été recrédité, ` +
          `pour ne pas payer deux fois. Vérifier le solde du compte connecté avant toute régularisation.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          transactionId: tx.id,
          connectedAccountId: connectedAccountId ?? null,
          montant: Number(tx.montant),
          evenement,
        },
      })
      .catch(() => {});
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
      outcome: 'failed',
      reversal: 'transfer_not_found',
    });
    return 'introuvable';
  }
}
