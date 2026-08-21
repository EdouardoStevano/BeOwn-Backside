import { Injectable } from '@nestjs/common';
import {
  PayoutMethodError,
  PayoutMethodKind,
  PayoutMethodsReader,
} from '../ports/payout-methods.port';
import {
  INSTANT_PAYOUT_RANGE_MESSAGE,
  isInstantPayoutAmountAllowed,
} from '../../domains/instant-payout-limits';

/**
 * Destination de versement retenue pour un retrait.
 *
 * `explicit = false` signifie que l'appelant n'a demandé NI destination NI
 * méthode : c'est le parcours historique, et le payout est alors créé sans
 * `method` ni `destination` — comportement strictement inchangé (Lot 4a exige
 * la rétrocompatibilité de `POST /payments/retrait`).
 */
export interface ResolvedPayoutDestination {
  payoutMethodId?: string;
  method: PayoutMethodKind;
  explicit: boolean;
}

export interface ResolvePayoutDestinationInput {
  connectedAccountId: string;
  amount: number;
  payoutMethodId?: string;
  method?: PayoutMethodKind;
}

/**
 * Valide et résout la destination d'un retrait AVANT tout débit du wallet.
 *
 * SRP : `RequestRetraitUseCase` orchestre le mouvement d'argent ; décider et
 * contrôler la destination est une responsabilité distincte, isolée ici.
 *
 * ISP / sécurité : ce service n'injecte que `PayoutMethodsReader`. Il ne peut
 * structurellement pas ajouter, supprimer ni redéfinir une destination.
 *
 * DIP : aucune dépendance au SDK Stripe — testable sans réseau via
 * `InMemoryPayoutMethodsAdapter`.
 */
@Injectable()
export class PayoutDestinationResolver {
  constructor(private readonly payoutMethods: PayoutMethodsReader) {}

  /**
   * @throws PayoutMethodError — AMOUNT_OUT_OF_RANGE, NO_PAYOUT_METHOD,
   *         CARD_NOT_INSTANT_ELIGIBLE. Aucun débit n'a eu lieu à ce stade.
   */
  async resolve(
    input: ResolvePayoutDestinationInput,
  ): Promise<ResolvedPayoutDestination> {
    const { connectedAccountId, amount, payoutMethodId } = input;

    // Parcours historique : ni destination ni méthode → on ne touche à rien.
    if (!payoutMethodId && !input.method) {
      return { method: 'standard', explicit: false };
    }

    const method: PayoutMethodKind = input.method ?? 'standard';

    // Bornes Stripe du versement instantané, contrôlées avant le débit.
    if (method === 'instant' && !isInstantPayoutAmountAllowed(amount)) {
      throw new PayoutMethodError(
        'AMOUNT_OUT_OF_RANGE',
        INSTANT_PAYOUT_RANGE_MESSAGE,
      );
    }

    const target = payoutMethodId
      ? // Appartenance vérifiée par ressource (anti-IDOR) : `connectedAccountId`
        // provient de la base, jamais du client.
        await this.payoutMethods.find(connectedAccountId, payoutMethodId)
      : // Méthode demandée sans destination explicite → destination par défaut.
        (await this.payoutMethods.list(connectedAccountId)).find(
          (m) => m.isDefault,
        ) ?? null;

    if (!target) {
      throw new PayoutMethodError(
        'NO_PAYOUT_METHOD',
        payoutMethodId
          ? 'Cette destination de retrait est introuvable.'
          : 'Aucune destination de retrait enregistrée. Ajoutez une carte avant de retirer.',
      );
    }

    if (method === 'instant' && !target.instantEligible) {
      throw new PayoutMethodError(
        'CARD_NOT_INSTANT_ELIGIBLE',
        'Cette carte n\'accepte pas le virement instantané. Choisissez le virement standard ou une autre carte.',
      );
    }

    return { payoutMethodId: target.id, method, explicit: true };
  }
}
