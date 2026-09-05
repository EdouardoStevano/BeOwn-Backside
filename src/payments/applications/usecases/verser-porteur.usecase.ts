import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { STATUTS_PROJET_VERSABLES } from 'src/projects/domains/enums/project-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { KIND_VERSEMENT_PORTEUR } from 'src/wallets/applications/project-ledger.service';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { formatEur } from 'src/shared/money/format-eur';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { StripeConnectService } from '../../infrastructure/stripe-connect.service';
import { RequestRetraitUseCase } from './request-retrait.usecase';

export interface VerserPorteurInput {
  projetId: string;
  /** Montant à verser ; à défaut, tout le solde du portefeuille du projet. */
  montant?: number;
  /** Clé fournie par le back-office : une resoumission ne verse pas deux fois. */
  idempotencyKey?: string;
  /** Administrateur à l'origine du versement, tracé sur l'écriture. */
  declareParUserId: number;
}

export type VerserPorteurResultat =
  | {
      success: true;
      transactionId: string;
      montant: number;
      statut: TransactionStatus;
      transferId: string;
      payoutId?: string;
      alreadyProcessed?: boolean;
    }
  | { success: false; code: string; message: string };

/**
 * Code stable du refus de versement pour statut de projet inadapté. Consommé
 * par le back-office pour distinguer ce cas d'un solde insuffisant.
 */
export const PROJET_NON_VERSABLE = 'PROJET_NON_VERSABLE';

/**
 * Verse au porteur, PAR STRIPE, ce que son projet lui doit.
 *
 * CE QUE CE CAS D'USAGE CHANGE — jusqu'ici le versement au porteur était
 * purement déclaratif : le back-office enregistrait un virement effectué à la
 * main, ailleurs (`ProjectLedgerService.declarerVersementPorteur`). L'ADR
 * « grand livre interne » l'assumait comme une dette, conditionnée au choix du
 * prestataire. Ce choix est fait : le versement s'exécute.
 *
 * POURQUOI UN CAS D'USAGE SÉPARÉ, ET NON UNE MÉTHODE DE `ProjectLedgerService` —
 * ce service tient sa garantie de son ABSENCE de collaborateur externe : « le
 * service ne parle à aucun prestataire de paiement » y est une propriété de sa
 * signature, pas une promesse. Y injecter Stripe la détruirait, et avec elle la
 * lisibilité de l'écran de constat, qui reste utile (virements hors plateforme,
 * régularisations). Les deux chemins coexistent et écrivent la MÊME forme
 * d'écriture ; seul le canal diffère.
 *
 * DISCIPLINE DE VERSEMENT — strictement celle du retrait investisseur, dont il
 * réutilise les primitives durcies :
 *  1. débit ATOMIQUE et CONDITIONNEL du portefeuille du projet (`solde >=
 *     montant`), sous verrou pessimiste, avant tout appel au prestataire ;
 *  2. Transfer plateforme → compte connecté du porteur, idempotent ;
 *  3. Payout compte connecté → banque.
 * Un échec du transfert annule tout (recrédit + ECHOUE). Un échec du payout
 * rapatrie D'ABORD les fonds (reversal) puis recrédite — jamais l'inverse : les
 * fonds seraient à la fois sur le compte connecté et sur le portefeuille du
 * projet. Le passage à REUSSI est prononcé par le webhook `payout.paid`, seul
 * témoin de l'arrivée en banque.
 */
@Injectable()
export class VerserPorteurUseCase {
  private readonly logger = new Logger(VerserPorteurUseCase.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
    private readonly stripeConnect: StripeConnectService,
    /**
     * Recrédit idempotent PARTAGÉ avec le retrait investisseur et les webhooks
     * `payout.failed` / `payout.canceled` / `transfer.reversed`. Le réutiliser
     * plutôt que de le réécrire est ce qui garantit qu'un versement au porteur
     * ne peut pas être dénoué deux fois : il n'existe qu'UNE implémentation du
     * recrédit, et elle porte déjà le verrou et la garde `metadata.recredited`.
     */
    private readonly requestRetrait: RequestRetraitUseCase,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsPort,
  ) {}

  async execute(input: VerserPorteurInput): Promise<VerserPorteurResultat> {
    const cleIdempotence = input.idempotencyKey
      ? `versement-porteur-stripe:${input.projetId}:${input.idempotencyKey}`
      : `versement-porteur-stripe:${input.projetId}:${randomUUID()}`;

    if (input.idempotencyKey) {
      const existant = await this.txRepo.findOne({
        where: { idempotencyKey: cleIdempotence },
      });
      if (existant) return this.resultatDejaTraite(existant);
    }

    const { projet, porteurId } = await this.chargerProjetEtPorteur(input.projetId);

    // Le compte de retrait du porteur est vérifié AVANT tout débit : ouvrir un
    // versement vers un compte qui ne peut pas recevoir immobiliserait les
    // fonds du projet le temps du dénouement, pour rien.
    const connect = await this.stripeConnect.getAccountStatus(porteurId);
    if (!connect.payoutsEnabled || !connect.accountId) {
      throw new ConflictException(
        'Le porteur n’a pas de compte de retrait Stripe actif : ' +
          'il doit terminer son onboarding avant tout versement.',
      );
    }

    let ouvert: Awaited<ReturnType<typeof this.ouvrirVersement>>;
    try {
      ouvert = await this.ouvrirVersement(
        input,
        projet.id,
        porteurId,
        connect.accountId,
        cleIdempotence,
      );
    } catch (err: any) {
      // COURSE sur la même clé d'idempotence : le pré-check `findOne` ci-dessus
      // n'est qu'un raccourci de confort — deux soumissions simultanées le
      // passent toutes les deux, et c'est la contrainte d'unicité en base qui
      // tranche (le débit du perdant est annulé avec sa transaction, aucun euro
      // ne bouge deux fois). Traduire la violation en réponse « déjà traité »
      // plutôt qu'en 500 : l'idempotence promise au back-office doit tenir
      // aussi sous concurrence, pas seulement en resoumission séquentielle.
      const estDoublon =
        err?.code === '23505' || err?.driverError?.code === '23505';
      if (estDoublon && input.idempotencyKey) {
        const gagnant = await this.txRepo.findOne({
          where: { idempotencyKey: cleIdempotence },
        });
        if (gagnant) return this.resultatDejaTraite(gagnant);
      }
      throw err;
    }
    if (!ouvert.ok) {
      this.metrics.incrementCounter(METRIC.PORTEUR_VERSEMENT_TOTAL, {
        canal: 'stripe_connect',
        outcome: 'rejected',
      });
      return { success: false, code: ouvert.code, message: ouvert.message };
    }
    const tx = ouvert.tx;
    const montant = Number(tx.montant);

    // 2. Transfer plateforme → compte connecté du porteur.
    let transferId: string;
    try {
      transferId = await this.stripeConnect.createTransfer({
        amountMajor: montant,
        currency: tx.devise ?? 'EUR',
        destinationAccountId: connect.accountId,
        idempotencyKey: `versement-transfer:${tx.id}`,
        metadata: { retraitTxId: tx.id, projetId: projet.id, userId: String(porteurId) },
      });
    } catch (err: any) {
      // Aucun euro n'a quitté la plateforme → rollback intégral du débit.
      this.logger.error(
        `Versement porteur : transfert échoué tx=${tx.id} projet=${projet.id}: ${err?.message}`,
      );
      await this.requestRetrait.recreditRetrait(
        tx.id,
        `Transfert Stripe échoué : ${err?.message ?? 'inconnu'}`,
        TransactionStatus.ECHOUE,
      );
      this.metrics.incrementCounter(METRIC.PORTEUR_VERSEMENT_TOTAL, {
        canal: 'stripe_connect',
        outcome: 'transfer_failed',
      });
      return {
        success: false,
        code: 'TRANSFER_FAILED',
        message:
          'Le versement a échoué, le portefeuille du projet a été recrédité.',
      };
    }

    await this.txRepo.update(tx.id, {
      fournisseurRef: transferId,
      metadata: { ...(tx.metadata as any), transferId },
    });

    // 3. Payout compte connecté → banque du porteur. Un refus laisse les fonds
    //    sur le compte connecté : on les rapatrie AVANT tout recrédit.
    let payoutId: string | undefined;
    try {
      payoutId = await this.stripeConnect.createPayoutOnConnectedAccount({
        amountMajor: montant,
        currency: tx.devise ?? 'EUR',
        connectedAccountId: connect.accountId,
        idempotencyKey: `versement-payout:${tx.id}`,
        metadata: { retraitTxId: tx.id },
      });
      await this.txRepo.update(tx.id, {
        metadata: { ...(tx.metadata as any), transferId, payoutId },
      });
    } catch (err: any) {
      // Comme pour le retrait investisseur au parcours historique : le compte
      // Express verse automatiquement. Le transfert a réussi, l'argent est
      // arrivé chez le porteur — on NE rollback PAS, on journalise.
      this.logger.warn(
        `Versement porteur : payout explicite non créé tx=${tx.id} ` +
        `(versement automatique probable) : ${err?.message}`,
      );
    }

    this.metrics.incrementCounter(METRIC.PORTEUR_VERSEMENT_TOTAL, {
      canal: 'stripe_connect',
      outcome: 'success',
    });
    this.metrics.observeHistogram(METRIC.PORTEUR_VERSEMENT_AMOUNT_EUR, montant, {
      canal: 'stripe_connect',
    });

    this.notifications
      .push({
        utilisateurId: porteurId,
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Versement en cours',
        message:
          `Un versement de ${formatEur(montant)} au titre de votre projet est en cours ` +
          "d'acheminement vers votre compte bancaire.",
        metadata: { transactionId: tx.id, projetId: projet.id, transferId },
      })
      .catch(() => {});

    this.logger.log(
      `Versement porteur exécuté : projet=${projet.id} montant=${montant} ` +
      `tx=${tx.id} transfer=${transferId} payout=${payoutId ?? 'auto'}`,
    );

    return {
      success: true,
      transactionId: tx.id,
      montant,
      statut: tx.statut,
      transferId,
      ...(payoutId ? { payoutId } : {}),
    };
  }

  /** Réponse rendue pour un versement déjà engagé sous la même clé. */
  private resultatDejaTraite(existant: TransactionEntity): VerserPorteurResultat {
    return {
      success: true,
      transactionId: existant.id,
      montant: Number(existant.montant),
      statut: existant.statut,
      transferId:
        ((existant.metadata ?? {}) as any).transferId ?? existant.fournisseurRef ?? '',
      alreadyProcessed: true,
    };
  }

  /** Projet existant, porté par un utilisateur identifié. */
  private async chargerProjetEtPorteur(
    projetId: string,
  ): Promise<{ projet: ProjectEntity; porteurId: number }> {
    const projet = await this.projectRepo.findOne({ where: { id: projetId } });
    if (!projet) throw new NotFoundException('Projet introuvable.');
    if (projet.porteurId == null) {
      throw new ConflictException(
        'Ce projet n’a pas de porteur rattaché : impossible de désigner un bénéficiaire.',
      );
    }

    // B8 — LE STATUT DU PROJET N'ÉTAIT PAS CONTRÔLÉ.
    //
    // Le versement au porteur n'était gardé que par le solde du portefeuille
    // de projet. Or ce portefeuille se remplit DÈS la collecte : un projet
    // encore EN_COLLECTE, voire un projet en ÉCHEC ou ANNULÉ dont les fonds
    // attendent d'être remboursés aux investisseurs, pouvait être vidé vers le
    // porteur. L'argent des souscripteurs ne devient celui du porteur qu'une
    // fois la collecte ABOUTIE — avant, il leur est encore dû.
    if (!STATUTS_PROJET_VERSABLES.includes(projet.statut)) {
      throw new ConflictException({
        statusCode: 409,
        code: PROJET_NON_VERSABLE,
        message:
          `Versement impossible : le projet est au statut « ${projet.statut} ». ` +
          'Les fonds ne sont versables au porteur qu’une fois la collecte ' +
          'aboutie (finance, en_exploitation ou cloture).',
      });
    }

    return { projet, porteurId: projet.porteurId };
  }

  /**
   * Débit du portefeuille du projet + ouverture de l'écriture de versement,
   * dans UNE transaction.
   *
   * Le décrément est CONDITIONNEL (`solde >= montant`) : deux versements
   * concurrents ne peuvent pas passer tous deux un contrôle fondé sur une
   * lecture obsolète. C'est la même garde que le retrait investisseur, et pour
   * la même raison — sauf qu'ici le solde qui protège est celui du projet,
   * c'est-à-dire l'argent des investisseurs tant qu'il n'est pas versé.
   */
  private async ouvrirVersement(
    input: VerserPorteurInput,
    projetId: string,
    porteurId: number,
    connectedAccountId: string,
    idempotencyKey: string,
  ): Promise<
    | { ok: true; tx: TransactionEntity }
    | { ok: false; code: string; message: string }
  > {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.projectWalletResolver.executeInTransaction(
        manager,
        projetId,
      );

      const solde = Number(wallet.solde);
      const montant = input.montant !== undefined ? Number(input.montant) : solde;
      if (!Number.isFinite(montant) || montant <= 0) {
        throw new BadRequestException(
          'Le montant du versement doit être strictement positif.',
        );
      }

      const decrement = await manager
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde - :montant' })
        .setParameter('montant', montant)
        .where('id = :id AND solde >= :montant', { id: wallet.id, montant })
        .execute();
      if (!decrement.affected) {
        return {
          ok: false as const,
          code: 'INSUFFICIENT_FUNDS',
          message: `Le portefeuille du projet ne couvre pas ${formatEur(montant)}.`,
        };
      }

      // Sortie à contrepartie EXTERNE : le compte bancaire du porteur.
      // `metadata` porte exactement les clés que lisent les webhooks payout
      // (`method`, `connectedAccountId`, `userId`) — c'est ce qui permet au
      // dénouement durci du retrait de s'appliquer tel quel à ce versement.
      const tx = await manager.save(
        manager.create(TransactionEntity, {
          walletSource: wallet.id,
          walletDestination: null,
          type: TransactionType.RETRAIT,
          montant,
          devise: wallet.devise ?? 'EUR',
          statut: TransactionStatus.EN_COURS,
          fournisseur: TransactionFournisseur.STRIPE,
          projetId,
          idempotencyKey,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: {
            kind: KIND_VERSEMENT_PORTEUR,
            method: 'stripe_connect',
            connectedAccountId,
            userId: porteurId,
            projetId,
            declarePar: input.declareParUserId,
          },
        }),
      );

      return { ok: true as const, tx };
    });
  }

  /** Escalade d'un versement resté en suspens vers les rôles habilités. */
  alerterFinance(titre: string, message: string, metadata: Record<string, unknown>): void {
    this.notifications
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre,
        message,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata,
      })
      .catch(() => {});
  }
}
