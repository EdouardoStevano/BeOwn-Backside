import { Inject, Injectable } from '@nestjs/common';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  PAYMENT_GATEWAY,
  type Paiement,
  type PaymentGateway,
} from '../ports/payment.gateway';

export interface OuvrirUnDepotCommand {
  utilisateurId: number;
  montant: Money;
  /** Ce que le paiement finance — `depot` par défaut. */
  operationType?: string;
  projetId?: string;
}

/**
 * Ouvre un paiement et rend de quoi le confirmer côté navigateur.
 *
 * Le use case est mince, et c'est normal : ouvrir un paiement ne déplace aucun
 * argent et ne touche aucun agrégat. Ce qu'il porte tient en une décision —
 * **poser le titulaire dans les métadonnées du paiement** — et cette décision
 * est tout sauf anodine : c'est elle qui rend la confirmation vérifiable, donc
 * elle qui empêche un tiers de récolter le dépôt (voir
 * {@link ConfirmerUnDepotUseCase}). Elle est confiée à la passerelle, qui
 * l'écrit systématiquement, plutôt que laissée au bon vouloir de l'appelant.
 */
@Injectable()
export class OuvrirUnDepotUseCase {
  constructor(
    @Inject(PAYMENT_GATEWAY)
    private readonly paiements: PaymentGateway,
  ) {}

  execute(commande: OuvrirUnDepotCommand): Promise<Paiement> {
    return this.paiements.ouvrirUnPaiement({
      montant: commande.montant,
      utilisateurId: commande.utilisateurId,
      metadata: {
        operationType: commande.operationType ?? 'depot',
        ...(commande.projetId ? { projetId: commande.projetId } : {}),
      },
    });
  }
}
