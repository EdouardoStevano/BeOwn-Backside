import type { IEvent } from '@nestjs/cqrs';

/**
 * Un investisseur vient de souscrire : les fonds sont débités, les fractions
 * lui sont allouées et sa souscription est ferme.
 *
 * C'est le fait dont `servicing` a besoin pour déclencher l'échéancier (§3.4,
 * §18) et `notifications` pour prévenir l'investisseur et le back-office.
 */
export class InvestissementSouscritDomainEvent implements IEvent {
  constructor(
    public readonly investissementId: string,
    public readonly projetId: string,
    public readonly utilisateurId: number,
    public readonly montant: number,
    public readonly nbFractions: number,
    /** Renseigné quand la souscription naît d'une réservation convertie. */
    public readonly reservationId: string | null,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
