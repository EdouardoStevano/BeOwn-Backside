import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { StripePaymentService } from './stripe-payment.service';
import {
  ConnectAccountReader,
  type ConnectAccountStatus,
} from '../applications/ports/connect-account.port';
import { InvestorIdentityReader } from '../applications/ports/investor-identity.port';
import { KycDocumentSource } from '../applications/ports/kyc-document.port';
import { buildIndividualPrefill } from '../domains/connect-prefill';

// `ConnectAccountStatus` est désormais déclaré dans le port (couche
// application) et ré-exporté ici : les importeurs historiques de ce fichier
// (payment.controller, request-retrait.usecase) restent inchangés.
export type { ConnectAccountStatus };

export interface CreateTransferParams {
  amountMajor: number;
  currency: string;
  destinationAccountId: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export interface CreatePayoutParams {
  amountMajor: number;
  currency: string;
  connectedAccountId: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  /**
   * Lot 4a — mode de versement demandé. Omis = comportement historique
   * (Stripe applique `standard`).
   */
  method?: 'instant' | 'standard';
  /**
   * Lot 4a — external account destinataire (carte ou IBAN). Omis = destination
   * par défaut du compte connecté, comme avant.
   */
  destination?: string;
}

/**
 * E3 — Stripe Connect Express : onboarding du compte de retrait de
 * l'investisseur, statut du compte, et primitives de versement
 * (Transfer plateforme → compte connecté, Payout compte connecté → banque,
 * et reversal en cas d'échec).
 *
 * ⚠ NON TESTABLE sans clés Stripe live : le code compile mais les appels
 * Stripe réels (accounts.create, accountLinks.create, transfers.create,
 * payouts.create) doivent être vérifiés en STAGING. Voir la checklist du
 * rapport E3.
 *
 * Réutilise le client Stripe déjà instancié dans StripePaymentService
 * (clés configurées à un seul endroit — pas de reconfiguration ici).
 */
@Injectable()
export class StripeConnectService implements ConnectAccountReader {
  private readonly logger = new Logger(StripeConnectService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly stripePayment: StripePaymentService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    /** Identité déjà vérifiée au KYC, servant à pré-remplir l'onboarding. */
    private readonly identities: InvestorIdentityReader,
    /** Pièce d'identité du KYC, attachée au compte pour pré-satisfaire
     *  l'exigence de vérification (voir attachKycDocument). */
    private readonly kycDocuments: KycDocumentSource,
  ) {}

  /** Client Stripe partagé (typé `any` comme le reste du module Stripe). */
  private get stripe(): any {
    return this.stripePayment.client;
  }

  /**
   * Crée (si absent) le compte Stripe Connect Express de l'investisseur et
   * renvoie son id. Idempotent au niveau applicatif : si l'utilisateur a déjà
   * un `stripeConnectAccountId`, on le retourne sans recréer de compte.
   *
   * `capabilities.transfers` est demandé (indispensable pour recevoir des
   * Transfer depuis la plateforme). Le compte est `individual` par défaut.
   *
   * PRÉ-REMPLISSAGE. Nom, date de naissance et adresse sont poussés dès la
   * création à partir du profil déjà vérifié au KYC : Stripe cesse alors de
   * les redemander, et l'écran d'onboarding se réduit à une confirmation.
   * Le pré-remplissage est un CONFORT, jamais une condition — voir le repli
   * ci-dessous.
   */
  async createOrGetExpressAccount(userId: number, email?: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.stripeConnectAccountId) return user.stripeConnectAccountId;

    const account = await this.createAccountWithPrefillFallback(userId, email);

    user.stripeConnectAccountId = account.id;
    // Snapshot initial des drapeaux (tous false tant que l'onboarding n'est
    // pas terminé). Ils seront rafraîchis par le webhook `account.updated`.
    user.stripeConnectPayoutsEnabled = !!account.payouts_enabled;
    user.stripeConnectChargesEnabled = !!account.charges_enabled;
    user.stripeConnectDetailsSubmitted = !!account.details_submitted;
    await this.userRepo.save(user);

    this.logger.log(`Compte Stripe Connect Express créé: userId=${userId} account=${account.id}`);

    // Lancé SANS attente : le téléchargement puis le re-téléversement de la
    // pièce ajouteraient plusieurs secondes au clic « Configurer mon compte »,
    // alors que la fenêtre d'attache reste ouverte jusqu'à la fin de
    // l'onboarding hébergé (plusieurs minutes). L'échec est logué dans la
    // méthode elle-même et ne compromet rien : au pire, Stripe demandera la
    // pièce à l'investisseur, comme avant.
    void this.attachKycDocument(account.id, userId);

    return account.id;
  }

  /**
   * Attache la pièce d'identité du KYC au compte connecté qui vient d'être
   * créé, pour que l'exigence `individual.verification.document` — déclenchée
   * sinon au premier seuil de volume (« Actions requises : fournir une pièce
   * d'identité ») — soit satisfaite d'avance et ne soit JAMAIS présentée à
   * l'investisseur.
   *
   * Vérifié contre l'API réelle : document accepté à la création et tant que
   * le titulaire n'a pas terminé son onboarding ; une fois le compte réclamé,
   * Stripe refuse toute modification d'identité par la plateforme — d'où cet
   * unique point d'appel, immédiatement après la création.
   *
   * Chaque face est re-téléversée DANS LE PÉRIMÈTRE du compte connecté
   * (`stripeAccount` + purpose `identity_document`) : un fichier Identity
   * appartient à la plateforme et ne peut pas être référencé directement.
   * Best-effort intégral : aucune exception ne sort d'ici.
   */
  async attachKycDocument(accountId: string, userId: number): Promise<void> {
    try {
      const piece = await this.kycDocuments.findByUserId(userId);
      if (!piece) {
        this.logger.log(
          `Pièce KYC indisponible, compte Connect créé sans document: userId=${userId}`,
        );
        return;
      }

      const upload = (face: { data: Buffer; mimeType: string; filename: string }) =>
        this.stripe.files.create(
          {
            purpose: 'identity_document',
            file: {
              data: face.data,
              name: face.filename,
              type: face.mimeType,
            },
          },
          { stripeAccount: accountId },
        );

      const front = await upload(piece.front);
      const back = piece.back ? await upload(piece.back) : null;

      await this.stripe.accounts.update(accountId, {
        individual: {
          verification: {
            document: {
              front: front.id,
              ...(back ? { back: back.id } : {}),
            },
          },
        },
      });

      this.logger.log(
        `Pièce KYC attachée au compte Connect: userId=${userId} account=${accountId} faces=${back ? 2 : 1}`,
      );
    } catch (error) {
      this.logger.warn(
        `Attache de la pièce KYC échouée (sans conséquence, Stripe la demandera lui-même): ` +
          `userId=${userId} account=${accountId} err=${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  /**
   * Création du compte avec pré-remplissage, et REPLI SANS PRÉ-REMPLISSAGE si
   * Stripe le refuse.
   *
   * Ce repli n'est pas de la prudence décorative. Sans lui, une seule donnée de
   * profil que Stripe juge invalide — un pays inconnu, une adresse rejetée par
   * sa validation postale — empêcherait la création du compte, donc TOUT
   * retrait, pour un utilisateur dont le dossier est par ailleurs complet. Un
   * confort ne doit jamais pouvoir bloquer l'accès à son argent : on réessaie
   * nu, ce qui redonne exactement le comportement d'avant.
   *
   * L'échec est journalisé en `warn` avec l'utilisateur concerné : c'est le
   * signal qu'un profil contient une donnée que Stripe refuse, et il vaut la
   * peine d'être vu.
   */
  private async createAccountWithPrefillFallback(
    userId: number,
    email?: string,
  ): Promise<any> {
    const base = {
      type: 'express',
      email: email ?? undefined,
      business_type: 'individual',
      capabilities: {
        transfers: { requested: true },
      },
      // Stripe traite tout bénéficiaire comme une « activité » et exige un
      // `business_profile.url` — écran absurde pour un particulier qui ne vend
      // rien et n'a pas de site. La description d'activité est acceptée en
      // substitution, et rien n'impose qu'elle soit saisie par l'utilisateur :
      // elle est identique pour tous les investisseurs, on la pose donc ici et
      // l'écran « Informations sur votre entreprise » disparaît. Dans `base`
      // et non dans le pré-remplissage d'identité : elle ne dépend d'aucune
      // donnée de profil et doit survivre à tous les replis.
      business_profile: {
        product_description:
          'Particulier investisseur — reçoit les retraits de son portefeuille ' +
          "d'investissement immobilier fractionné sur la plateforme BeOwn.",
      },
      metadata: { userId: String(userId) },
    };

    let prefill: ReturnType<typeof buildIndividualPrefill>;
    try {
      prefill = buildIndividualPrefill(await this.identities.findByUserId(userId));
    } catch (error) {
      // Le profil est illisible : ce n'est pas une raison de refuser le compte.
      this.logger.warn(
        `Profil illisible, compte Connect créé sans pré-remplissage: userId=${userId} err=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      prefill = undefined;
    }

    if (!prefill) return this.stripe.accounts.create(base);

    // Dégradation PROGRESSIVE, pas tout ou rien. Deux champs peuvent être
    // refusés par des règles que la plateforme ne peut pas reproduire :
    //  - le téléphone, validé contre les plans de numérotation réels, bien
    //    au-delà du format E.164 vérifié par `buildIndividualPrefill` ;
    //  - l'adresse, qui doit être dans le pays du compte (celui de la
    //    plateforme), ce qu'un investisseur étranger ne satisfait pas.
    // Constaté en test : chacun de ces refus rejette TOUTE la création alors
    // que nom et naissance étaient bons. On pèle donc les champs fragiles un à
    // un — sans téléphone, puis sans adresse — avant de renoncer entièrement.
    const tentatives: (typeof prefill)[] = [prefill];
    for (const fragile of ['phone', 'address'] as const) {
      const precedent = tentatives[tentatives.length - 1]!;
      if (!precedent[fragile]) continue;
      const { [fragile]: _retire, ...reste } = precedent;
      if (Object.keys(reste).length > 0) tentatives.push(reste);
    }

    for (const candidat of tentatives) {
      try {
        const account = await this.stripe.accounts.create({
          ...base,
          individual: candidat,
        });
        this.logger.log(
          `Compte Connect pré-rempli: userId=${userId} champs=${Object.keys(candidat).join(',')}`,
        );
        return account;
      } catch (error) {
        this.logger.warn(
          `Pré-remplissage refusé par Stripe (champs=${Object.keys(candidat).join(',')}): userId=${userId} err=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return this.stripe.accounts.create(base);
  }

  /**
   * Crée un AccountLink d'onboarding hébergé par Stripe et renvoie l'URL.
   * `refreshUrl` est appelée si le lien expire, `returnUrl` au retour.
   *
   * `collection_options.fields: 'currently_due'` limite le formulaire à ce qui
   * est exigible MAINTENANT, au lieu de réclamer d'emblée tout ce qui le
   * deviendra un jour (`eventually_due`, le défaut de Stripe). L'investisseur
   * atteint son premier retrait par le chemin le plus court.
   *
   * Contrepartie assumée : Stripe pourra redemander des informations plus tard,
   * à l'approche des seuils qui les rendent exigibles. `account.updated` remet
   * alors `payoutsEnabled` à jour et l'écran de retrait propose de reprendre
   * l'onboarding — le cas est déjà couvert.
   */
  async createAccountLink(
    userId: number,
    returnUrl: string,
    refreshUrl: string,
    email?: string,
  ): Promise<string> {
    const accountId = await this.createOrGetExpressAccount(userId, email);
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
      collection_options: { fields: 'currently_due' },
    });
    return link.url;
  }

  /**
   * Statut live du compte connecté. Rafraîchit aussi les drapeaux en base
   * (source secondaire au webhook `account.updated`), de sorte que le retrait
   * et le front disposent d'un état à jour même si le webhook n'a pas encore
   * été livré.
   */
  async getAccountStatus(userId: number): Promise<ConnectAccountStatus> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user?.stripeConnectAccountId) {
      return {
        connected: false,
        accountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    const account = await this.stripe.accounts.retrieve(user.stripeConnectAccountId);
    const status: ConnectAccountStatus = {
      connected: true,
      accountId: account.id,
      detailsSubmitted: !!account.details_submitted,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
    };

    // Persist le cache si changement
    if (
      user.stripeConnectPayoutsEnabled !== status.payoutsEnabled ||
      user.stripeConnectChargesEnabled !== status.chargesEnabled ||
      user.stripeConnectDetailsSubmitted !== status.detailsSubmitted
    ) {
      user.stripeConnectPayoutsEnabled = status.payoutsEnabled;
      user.stripeConnectChargesEnabled = status.chargesEnabled;
      user.stripeConnectDetailsSubmitted = status.detailsSubmitted;
      await this.userRepo.save(user);
    }

    return status;
  }

  /**
   * Transfer plateforme → compte connecté. `idempotencyKey` Stripe garantit
   * qu'un rejeu (retry réseau, resoumission) ne crée pas un second transfert.
   * Renvoie l'id du transfert.
   */
  async createTransfer(params: CreateTransferParams): Promise<string> {
    const transfer = await this.stripe.transfers.create(
      {
        amount: Math.round(params.amountMajor * 100),
        currency: params.currency.toLowerCase(),
        destination: params.destinationAccountId,
        metadata: params.metadata ?? {},
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return transfer.id;
  }

  /**
   * Payout compte connecté → banque de l'investisseur, exécuté DANS le
   * contexte du compte connecté (`stripeAccount`). Best-effort : si les
   * payouts du compte sont automatiques (schedule Stripe par défaut des
   * comptes Express), cet appel peut échouer — l'appelant doit alors se
   * reposer sur le payout automatique. `metadata.retraitTxId` permet de
   * remonter au retrait lors des webhooks payout.*.
   *
   * Lot 4a — `method` et `destination` sont ajoutés à la requête UNIQUEMENT
   * s'ils sont fournis : sans eux, la requête envoyée à Stripe est strictement
   * identique à celle d'avant (rétrocompatibilité du parcours historique).
   */
  async createPayoutOnConnectedAccount(params: CreatePayoutParams): Promise<string> {
    const payout = await this.stripe.payouts.create(
      {
        amount: Math.round(params.amountMajor * 100),
        currency: params.currency.toLowerCase(),
        metadata: params.metadata ?? {},
        ...(params.method ? { method: params.method } : {}),
        ...(params.destination ? { destination: params.destination } : {}),
      },
      {
        idempotencyKey: params.idempotencyKey,
        stripeAccount: params.connectedAccountId,
      },
    );
    return payout.id;
  }

  /**
   * État courant d'un payout, LU dans le contexte du compte connecté qui l'a
   * émis (`stripeAccount`) — sans quoi Stripe cherche le payout sur le compte
   * plateforme et ne le trouve pas.
   *
   * POURQUOI une lecture directe : le statut d'un payout ne nous parvient
   * normalement que par webhook. Un webhook non reçu (endpoint injoignable,
   * abonnement expiré, environnement sans tunnel) laisse le retrait `en_cours`
   * pour toujours, alors que l'argent est arrivé en banque. C'est le seul moyen
   * de reconstituer la vérité sans attendre un événement qui ne viendra pas.
   *
   * Lecture SEULE, sans effet de bord : la vérification d'un chemin argent ne
   * doit jamais pouvoir créer le mouvement qu'elle cherche à constater.
   *
   * @returns le payout tel que Stripe le connaît, ou `null` s'il est
   *          introuvable ou si l'appel échoue — un échec de lecture ne prouve
   *          rien, l'appelant doit alors laisser le retrait en l'état.
   */
  async retrievePayout(
    payoutId: string,
    connectedAccountId?: string | null,
  ): Promise<{ id: string; status: string; metadata?: Record<string, string> } | null> {
    try {
      // Signature Stripe : retrieve(id, params?, options?). `stripeAccount`
      // est une OPTION CLIENT (3e position) — passé en 2e, il part comme
      // paramètre de requête et Stripe répond « Received unknown parameter »
      // (constaté au premier reap réel : 4 payouts pourtant payés, illisibles).
      const payout = await this.stripe.payouts.retrieve(
        payoutId,
        {},
        connectedAccountId ? { stripeAccount: connectedAccountId } : undefined,
      );
      return payout as any;
    } catch (err: any) {
      this.logger.warn(
        `Lecture du payout ${payoutId} impossible (compte=${connectedAccountId ?? 'plateforme'}): ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * Reversal d'un transfert (rapatrie les fonds du compte connecté vers la
   * plateforme). Utilisé lors du rollback d'un retrait dont le payout a
   * échoué. Idempotent via `idempotencyKey`.
   */
  async reverseTransfer(transferId: string, idempotencyKey: string): Promise<void> {
    await this.stripe.transfers.createReversal(
      transferId,
      {},
      { idempotencyKey },
    );
  }

  /**
   * Retrouve le transfert émis pour un retrait donné, quand la transaction
   * locale n'en a pas gardé la trace.
   *
   * POURQUOI c'est nécessaire : `createTransfer` peut parfaitement réussir
   * côté Stripe et l'écriture de `metadata.transferId` échouer juste après
   * (coupure, redémarrage, panne base). Le retrait se retrouve alors avec des
   * fonds bel et bien partis sur le compte connecté et AUCUNE référence pour
   * les rapatrier. Recréditer le portefeuille dans cet état paierait
   * l'investisseur deux fois : une fois sur son wallet, une fois sur son
   * compte Stripe.
   *
   * COMMENT : balayage BORNÉ des transferts vers le compte connecté, filtré
   * sur `metadata.retraitTxId` (posé à la création par `createTransfer`).
   * Stripe n'indexe pas les metadata des transferts et n'offre aucune lecture
   * par clé d'idempotence : la seule recherche possible est ce balayage. On
   * borne explicitement le nombre de pages plutôt que de dérouler tout
   * l'historique du compte.
   *
   * CE QU'ON NE FAIT PAS, ET POURQUOI : rejouer `transfers.create` avec la clé
   * déterministe `retrait-transfer:<txId>` renverrait bien le transfert
   * d'origine s'il existe — mais s'il n'existe PAS, ce « rejeu » le CRÉERAIT,
   * c'est-à-dire enverrait réellement l'argent, au moment précis où l'on
   * cherche à savoir s'il est parti. Une recherche ne doit avoir aucun effet
   * de bord sur un chemin argent : la lecture seule est la seule option
   * acceptable, même moins commode.
   *
   * @returns l'id du transfert, ou `null` si aucun transfert ne correspond —
   *          `null` ne PROUVE pas que l'argent n'est pas parti (le balayage
   *          est borné), l'appelant doit donc traiter ce cas en revue
   *          manuelle, jamais en recrédit automatique.
   */
  async findTransferIdForRetrait(params: {
    retraitTxId: string;
    destinationAccountId?: string | null;
  }): Promise<string | null> {
    const { retraitTxId, destinationAccountId } = params;
    if (!destinationAccountId) return null;
    const PAGES_MAX = 5;
    const PAR_PAGE = 100;
    let startingAfter: string | undefined;
    try {
      for (let page = 0; page < PAGES_MAX; page++) {
        const lot = await this.stripe.transfers.list({
          destination: destinationAccountId,
          limit: PAR_PAGE,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        const data: any[] = lot?.data ?? [];
        const trouve = data.find(
          (t) => t?.metadata?.retraitTxId === retraitTxId,
        );
        if (trouve?.id) return trouve.id;
        if (!lot?.has_more || data.length === 0) return null;
        startingAfter = data[data.length - 1]?.id;
      }
      this.logger.warn(
        `Balayage des transferts interrompu à ${PAGES_MAX} pages sans trouver ` +
        `le retrait ${retraitTxId} (compte ${destinationAccountId}).`,
      );
    } catch (err: any) {
      this.logger.error(
        `Balayage des transferts impossible pour le retrait ${retraitTxId}: ${err?.message}`,
      );
    }
    return null;
  }

  /** Retrouve l'utilisateur propriétaire d'un compte connecté (webhooks). */
  async findUserByConnectAccountId(accountId: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { stripeConnectAccountId: accountId } });
  }

  /**
   * Applique un objet `account` reçu par le webhook `account.updated` :
   * met à jour les drapeaux (dont `payoutsEnabled`). Renvoie true si le compte
   * vient de passer payouts activés (transition false → true), pour permettre
   * à l'appelant de notifier l'utilisateur.
   */
  async syncAccountFromWebhook(account: any): Promise<{ found: boolean; payoutsJustEnabled: boolean }> {
    if (!account?.id) return { found: false, payoutsJustEnabled: false };
    const user = await this.userRepo.findOne({ where: { stripeConnectAccountId: account.id } });
    if (!user) {
      this.logger.warn(`account.updated: aucun utilisateur pour account=${account.id} — no-op`);
      return { found: false, payoutsJustEnabled: false };
    }

    const before = user.stripeConnectPayoutsEnabled;
    user.stripeConnectPayoutsEnabled = !!account.payouts_enabled;
    user.stripeConnectChargesEnabled = !!account.charges_enabled;
    user.stripeConnectDetailsSubmitted = !!account.details_submitted;
    await this.userRepo.save(user);

    return {
      found: true,
      payoutsJustEnabled: !before && !!account.payouts_enabled,
    };
  }
}
