import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
/* eslint-disable @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return --
   Le client Stripe est typé `any` : c'est le propre d'une Anti-Corruption
   Layer que d'absorber un modèle externe non maîtrisé (§20). Les `any`
   s'arrêtent à ce fichier — tout ce qui en sort est typé par `ConnectGateway`. */
import { StripePaymentAdapter } from './stripe-payment.adapter';
import type {
  CompteDeRetrait,
  ConnectGateway,
  DemandeDeTransfert,
  DemandeDeVersement,
  EtatDuVersement,
  SyncCompteDeRetrait,
} from '../../application/ports/connect.gateway';

/** Aucun compte connu : l'état de départ, et non une absence de réponse. */
const AUCUN_COMPTE: CompteDeRetrait = {
  connected: false,
  accountId: null,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

/**
 * L'Anti-Corruption Layer de Stripe Connect Express (§20) : le compte par
 * lequel un investisseur reçoit ses retraits, et les gestes qui y portent des
 * fonds.
 *
 * Il implémente désormais {@link ConnectGateway} au lieu d'être injecté tel
 * quel dans le contrôleur et le use case. Le vocabulaire du fournisseur —
 * *transfer*, *payout*, *reversal*, les centimes, `snake_case` — s'arrête à
 * cette classe.
 *
 * ⚠ Les appels Stripe réels (accounts.create, accountLinks.create,
 * transfers.create, payouts.create) restent à vérifier en STAGING avec des
 * clés live ; le refactoring ne les a pas rendus testables ici, il les a
 * seulement mis derrière un port qui, lui, se double en test.
 *
 * **Écart connu**, hérité et signalé par `TreasuryModule` : cet adaptateur
 * écrit `UserEntity`, l'entité ORM du contexte IAM, parce que le compte
 * connecté d'un investisseur est rangé sur sa ligne de compte. C'est une
 * frontière de contexte franchie par la persistance (§3). La résorber demande
 * une table propre à la trésorerie et une migration de données — un chantier
 * distinct, qu'il vaut mieux voir écrit ici que découvrir plus tard.
 */
@Injectable()
export class StripeConnectAdapter implements ConnectGateway {
  private readonly logger = new Logger(StripeConnectAdapter.name);

  constructor(
    private readonly stripePayment: StripePaymentAdapter,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /** Client Stripe partagé (typé `any` comme le reste du module Stripe). */
  private get stripe(): any {
    return this.stripePayment.client;
  }

  async lienDOnboarding(params: {
    utilisateurId: number;
    email?: string;
    retourUrl: string;
    rafraichirUrl: string;
  }): Promise<string> {
    const accountId = await this.creerOuRetrouverLeCompte(
      params.utilisateurId,
      params.email,
    );
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      return_url: params.retourUrl,
      refresh_url: params.rafraichirUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  /**
   * Statut live du compte connecté. Rafraîchit aussi les drapeaux en base
   * (source secondaire au webhook `account.updated`), de sorte que le retrait
   * et le front disposent d'un état à jour même si le webhook n'a pas encore
   * été livré.
   */
  async statutDuCompte(utilisateurId: number): Promise<CompteDeRetrait> {
    const user = await this.userRepo.findOne({
      where: { userId: utilisateurId },
    });
    if (!user?.stripeConnectAccountId) return AUCUN_COMPTE;

    const account = await this.stripe.accounts.retrieve(
      user.stripeConnectAccountId,
    );
    const statut: CompteDeRetrait = {
      connected: true,
      accountId: account.id,
      detailsSubmitted: !!account.details_submitted,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
    };

    if (
      user.stripeConnectPayoutsEnabled !== statut.payoutsEnabled ||
      user.stripeConnectChargesEnabled !== statut.chargesEnabled ||
      user.stripeConnectDetailsSubmitted !== statut.detailsSubmitted
    ) {
      user.stripeConnectPayoutsEnabled = statut.payoutsEnabled;
      user.stripeConnectChargesEnabled = statut.chargesEnabled;
      user.stripeConnectDetailsSubmitted = statut.detailsSubmitted;
      await this.userRepo.save(user);
    }

    return statut;
  }

  /**
   * Plateforme → compte connecté. La clé d'idempotence garantit qu'un rejeu —
   * retry réseau, resoumission — ne crée pas un second transfert.
   */
  async transferer(demande: DemandeDeTransfert): Promise<string> {
    const transfer = await this.stripe.transfers.create(
      {
        amount: demande.montant.enCentimes(),
        currency: demande.montant.devise.toLowerCase(),
        destination: demande.compteDestinataire,
        metadata: demande.metadata ?? {},
      },
      { idempotencyKey: demande.cleDIdempotence },
    );
    return transfer.id;
  }

  /**
   * Compte connecté → banque, exécuté **dans le contexte du compte connecté**.
   *
   * Peut légitimement échouer quand les versements du compte sont automatiques
   * — le cas par défaut des comptes Express. L'appelant se repose alors sur ce
   * versement automatique, et ne défait rien : le transfert, lui, a réussi.
   */
  async verser(demande: DemandeDeVersement): Promise<string> {
    const payout = await this.stripe.payouts.create(
      {
        amount: demande.montant.enCentimes(),
        currency: demande.montant.devise.toLowerCase(),
        metadata: demande.metadata ?? {},
      },
      {
        idempotencyKey: demande.cleDIdempotence,
        stripeAccount: demande.compteConnecte,
      },
    );
    return payout.id;
  }

  /**
   * L'état d'un versement, traduit dans le vocabulaire du contexte.
   *
   * `in_transit` et `pending` sont regroupés sous « en cours » : ils disent la
   * même chose de notre point de vue — l'argent est parti, on ne sait pas
   * encore s'il est arrivé. `canceled` rejoint « échoué » : dans les deux cas
   * le titulaire n'a pas été payé et son solde doit lui revenir.
   *
   * Un versement introuvable ne lève pas : c'est le cas d'un identifiant
   * périmé, et la réconciliation doit pouvoir le constater sans échouer.
   */
  async etatDuVersement(
    versementId: string,
    compteConnecte: string,
  ): Promise<EtatDuVersement> {
    let payout: any;
    try {
      payout = await this.stripe.payouts.retrieve(versementId, {
        stripeAccount: compteConnecte,
      });
    } catch (err) {
      this.logger.warn(
        `Versement introuvable chez le fournisseur: payout=${versementId} ` +
          `account=${compteConnecte}: ${err instanceof Error ? err.message : 'inconnu'}`,
      );
      return 'inconnu';
    }

    switch (payout?.status) {
      case 'paid':
        return 'arrive';
      case 'failed':
      case 'canceled':
        return 'echoue';
      case 'pending':
      case 'in_transit':
        return 'en-cours';
      default:
        return 'inconnu';
    }
  }

  async rapatrierLeTransfert(
    transfertId: string,
    cleDIdempotence: string,
  ): Promise<void> {
    await this.stripe.transfers.createReversal(
      transfertId,
      {},
      { idempotencyKey: cleDIdempotence },
    );
  }

  /** Rend l'identifiant du titulaire, et non sa ligne ORM : elle appartient à IAM. */
  async titulaireDuCompte(compteId: number | string): Promise<number | null> {
    const user = await this.userRepo.findOne({
      where: { stripeConnectAccountId: String(compteId) },
    });
    return user?.userId ?? null;
  }

  async synchroniserDepuisWebhook(
    compte: unknown,
  ): Promise<SyncCompteDeRetrait> {
    const account = compte as any;
    if (!account?.id) return { found: false, payoutsJustEnabled: false };

    const user = await this.userRepo.findOne({
      where: { stripeConnectAccountId: account.id },
    });
    if (!user) {
      this.logger.warn(
        `account.updated: aucun utilisateur pour account=${account.id} — no-op`,
      );
      return { found: false, payoutsJustEnabled: false };
    }

    const avant = user.stripeConnectPayoutsEnabled;
    user.stripeConnectPayoutsEnabled = !!account.payouts_enabled;
    user.stripeConnectChargesEnabled = !!account.charges_enabled;
    user.stripeConnectDetailsSubmitted = !!account.details_submitted;
    await this.userRepo.save(user);

    return {
      found: true,
      payoutsJustEnabled: !avant && !!account.payouts_enabled,
    };
  }

  /**
   * Crée (si absent) le compte Connect Express de l'investisseur et rend son
   * id. Idempotent au niveau applicatif : un compte déjà rattaché est rendu
   * tel quel, sans en créer un second.
   *
   * `capabilities.transfers` est demandé — indispensable pour recevoir les
   * transferts de la plateforme.
   */
  private async creerOuRetrouverLeCompte(
    utilisateurId: number,
    email?: string,
  ): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { userId: utilisateurId },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.stripeConnectAccountId) return user.stripeConnectAccountId;

    const account = await this.stripe.accounts.create({
      type: 'express',
      email: email ?? undefined,
      business_type: 'individual',
      capabilities: { transfers: { requested: true } },
      metadata: { userId: String(utilisateurId) },
    });

    user.stripeConnectAccountId = account.id;
    // Snapshot initial des drapeaux (tous faux tant que l'onboarding n'est pas
    // terminé) ; le webhook `account.updated` les rafraîchira.
    user.stripeConnectPayoutsEnabled = !!account.payouts_enabled;
    user.stripeConnectChargesEnabled = !!account.charges_enabled;
    user.stripeConnectDetailsSubmitted = !!account.details_submitted;
    await this.userRepo.save(user);

    this.logger.log(
      `Compte Stripe Connect Express créé: userId=${utilisateurId} account=${account.id}`,
    );
    return account.id;
  }
}
