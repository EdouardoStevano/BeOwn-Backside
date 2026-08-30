import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';
import type { Money } from '../value-objects/money.vo';

/**
 * L'argent d'un paiement abouti est arrivé sur le portefeuille du titulaire.
 *
 * **Un seul fait, deux destinataires** — et c'est précisément ce que
 * l'événement permet de dire proprement. Le use case appelait deux méthodes du
 * port l'une après l'autre : l'une pour le titulaire, l'autre pour la finance.
 * Il décidait donc, en plus de créditer, **qui devait l'apprendre** (§14).
 * Ici il constate un dépôt ; que le back-office suive les entrées d'argent est
 * une décision d'abonné, qui peut changer — un seuil, un filtre par type de
 * portefeuille — sans que le crédit soit rouvert.
 *
 * Publié **après** la consignation, et seulement au premier passage : la
 * confirmation par le front et le webhook annoncent le même paiement, souvent à
 * quelques millisecondes d'écart, et le titulaire n'a pas à recevoir deux fois
 * l'annonce du même dépôt.
 */
export class DepotCrediteDomainEvent implements DomainEvent {
  readonly occurredAt = new Date();

  constructor(
    public readonly utilisateurId: number,
    public readonly walletId: string,
    public readonly montant: Money,
    /** La référence du paiement chez le fournisseur — trace du rapprochement. */
    public readonly paymentIntentId: string,
  ) {}
}

/**
 * Le compte de retrait du titulaire est devenu capable de recevoir des fonds.
 *
 * Le fait est **la transition**, pas l'état : un compte déjà actif dont le
 * fournisseur renvoie les drapeaux n'est pas un événement. C'est ce que
 * `payoutsJustEnabled` établit en amont — et c'est aussi pourquoi cet
 * événement n'est publié qu'une fois, au passage de `false` à `true`.
 */
export class CompteDeRetraitActiveDomainEvent implements DomainEvent {
  readonly occurredAt = new Date();

  constructor(
    public readonly utilisateurId: number,
    public readonly compteId: string,
  ) {}
}
