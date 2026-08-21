import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { StripePaymentAdapter } from './stripe-payment.adapter';

export interface ConnectAccountStatus {
  connected: boolean;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

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
 * Réutilise le client Stripe déjà instancié dans StripePaymentAdapter
 * (clés configurées à un seul endroit — pas de reconfiguration ici).
 */
@Injectable()
export class StripeConnectAdapter {
  private readonly logger = new Logger(StripeConnectAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly stripePayment: StripePaymentAdapter,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
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
   */
  async createOrGetExpressAccount(userId: number, email?: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.stripeConnectAccountId) return user.stripeConnectAccountId;

    const account = await this.stripe.accounts.create({
      type: 'express',
      email: email ?? undefined,
      business_type: 'individual',
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { userId: String(userId) },
    });

    user.stripeConnectAccountId = account.id;
    // Snapshot initial des drapeaux (tous false tant que l'onboarding n'est
    // pas terminé). Ils seront rafraîchis par le webhook `account.updated`.
    user.stripeConnectPayoutsEnabled = !!account.payouts_enabled;
    user.stripeConnectChargesEnabled = !!account.charges_enabled;
    user.stripeConnectDetailsSubmitted = !!account.details_submitted;
    await this.userRepo.save(user);

    this.logger.log(`Compte Stripe Connect Express créé: userId=${userId} account=${account.id}`);
    return account.id;
  }

  /**
   * Crée un AccountLink d'onboarding hébergé par Stripe et renvoie l'URL.
   * `refreshUrl` est appelée si le lien expire, `returnUrl` au retour.
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
   */
  async createPayoutOnConnectedAccount(params: CreatePayoutParams): Promise<string> {
    const payout = await this.stripe.payouts.create(
      {
        amount: Math.round(params.amountMajor * 100),
        currency: params.currency.toLowerCase(),
        metadata: params.metadata ?? {},
      },
      {
        idempotencyKey: params.idempotencyKey,
        stripeAccount: params.connectedAccountId,
      },
    );
    return payout.id;
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
