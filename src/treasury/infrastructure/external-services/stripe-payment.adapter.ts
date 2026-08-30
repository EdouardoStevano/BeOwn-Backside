import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
/* eslint-disable @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return --
   Les charges utiles Stripe sont typées `any` : c'est le propre d'une
   Anti-Corruption Layer que d'absorber un modèle externe non maîtrisé (§20).
   Les `any` s'arrêtent à ce fichier — tout ce qui en sort est typé. */
import type {
  CreatePaymentIntentParams,
  EvenementFournisseur,
  Paiement,
  PaymentGateway,
} from '../../application/ports/payment.gateway';
import { Money } from '../../domain/value-objects/money.vo';
import { SignatureWebhookInvalideError } from '../../domain/errors/treasury.errors';

/**
 * L'Anti-Corruption Layer des paiements Stripe (§20, §37.1).
 *
 * Tout ce qui est propre au fournisseur s'arrête ici : les centimes, les noms
 * de champs `snake_case`, la forme des événements, et la vérification HMAC.
 * Ce qui en ressort est du vocabulaire de trésorerie — une {@link Money}, un
 * {@link Paiement}, un {@link EvenementFournisseur}.
 *
 * La conversion en centimes en particulier ne franchit plus cette frontière :
 * elle était faite ici à l'aller (`* 100`) mais **au retour par les
 * appelants** (`Number(intent.amount) / 100`), dont le contrôleur HTTP. Une
 * asymétrie de ce genre sur de l'argent ne se voit pas en relisant un seul
 * fichier.
 */
@Injectable()
export class StripePaymentAdapter implements PaymentGateway {
  private readonly stripe: any;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  /**
   * Expose le client Stripe déjà instancié ici (clés configurées à un seul
   * endroit). `StripeConnectAdapter` le réutilise au lieu de re-créer une
   * instance et de relire les clés.
   */
  get client(): any {
    return this.stripe;
  }

  async ouvrirUnPaiement(params: CreatePaymentIntentParams): Promise<Paiement> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.montant.enCentimes(),
      currency: params.montant.devise.toLowerCase(),
      metadata: {
        userId: String(params.utilisateurId),
        ...params.metadata,
      },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    return this.versLePaiement(intent);
  }

  async lireLePaiement(intentId: string): Promise<Paiement> {
    return this.versLePaiement(
      await this.stripe.paymentIntents.retrieve(intentId),
    );
  }

  async rembourser(chargeId: string, montant?: Money): Promise<void> {
    await this.stripe.refunds.create({
      charge: chargeId,
      ...(montant ? { amount: montant.enCentimes() } : {}),
    });
  }

  authentifierLEvenement(
    charge: Buffer,
    signature: string,
  ): EvenementFournisseur {
    const secret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET');

    let evenement: any;
    try {
      evenement = this.stripe.webhooks.constructEvent(
        charge,
        signature,
        secret,
      );
    } catch (err) {
      // L'exception Stripe s'arrête ici : au-delà, c'est une erreur de domaine
      // que le filtre du contexte traduit (§21).
      throw new SignatureWebhookInvalideError(
        err instanceof Error ? err.message : 'signature illisible',
        err,
      );
    }

    return this.versLEvenement(evenement);
  }

  /**
   * Traduit un événement Stripe dans l'union que le contexte comprend.
   *
   * **C'est ici que s'arrêtent les `any`.** Chaque lecture de la charge utile
   * — `metadata.retraitTxId`, `payouts_enabled`, `amount` — est une hypothèse
   * sur la forme de la réponse d'un tiers ; les faire toutes au même endroit,
   * une fois, vaut mieux que de les disséminer dans les branches d'un webhook
   * qui décide de mouvements d'argent.
   */
  private versLEvenement(evenement: any): EvenementFournisseur {
    const entete = {
      id: String(evenement.id),
      type: String(evenement.type),
      compte: evenement.account ? String(evenement.account) : null,
    };
    const objet = evenement.data?.object ?? {};

    switch (entete.type) {
      case 'payment_intent.succeeded':
        return {
          ...entete,
          nature: 'paiement-abouti',
          paiement: this.versLePaiement(objet),
        };

      case 'account.updated':
        return {
          ...entete,
          nature: 'compte-mis-a-jour',
          compteId: String(objet.id ?? ''),
          payoutsEnabled: !!objet.payouts_enabled,
          chargesEnabled: !!objet.charges_enabled,
          detailsSubmitted: !!objet.details_submitted,
          brut: objet,
        };

      case 'payout.paid':
      case 'payout.failed':
        return {
          ...entete,
          nature:
            entete.type === 'payout.paid'
              ? 'versement-arrive'
              : 'versement-echoue',
          versementId: objet.id ? String(objet.id) : null,
          // Posé par la plateforme au moment du versement explicite ; absent
          // d'un versement déclenché automatiquement par Stripe.
          retraitId: objet.metadata?.retraitTxId
            ? String(objet.metadata.retraitTxId)
            : null,
        };

      default:
        return { ...entete, nature: 'a-relayer', brut: evenement };
    }
  }

  /**
   * Traduit un `PaymentIntent` en paiement du contexte.
   *
   * `utilisateurId` est rendu **typé et nullable** plutôt que laissé dans un
   * sac `metadata` de chaînes : c'est de lui que dépend le refus d'un crédit
   * qui ne vous appartient pas, et un `parseInt` recopié chez chaque appelant
   * finissait par produire un `NaN` traité comme un identifiant.
   */
  private versLePaiement(intent: any): Paiement {
    const metadata = (intent.metadata ?? {}) as Record<string, string>;
    const utilisateurId = Number.parseInt(metadata.userId, 10);

    return {
      intentId: intent.id,
      clientSecret: intent.client_secret ?? '',
      statut: intent.status,
      montant: Money.depuisCentimes(
        Number(intent.amount),
        (intent.currency ?? 'eur').toUpperCase(),
      ),
      utilisateurId: Number.isNaN(utilisateurId) ? null : utilisateurId,
      operationType: metadata.operationType ?? 'depot',
      metadata,
    };
  }
}
