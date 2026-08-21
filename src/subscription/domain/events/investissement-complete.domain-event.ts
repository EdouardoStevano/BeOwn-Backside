import type { IEvent } from '@nestjs/cqrs';

/**
 * Un investisseur a ajouté des fractions à une souscription déjà confirmée :
 * son wallet est débité du complément et son échéancier régénéré sur le
 * nouveau capital.
 */
export class InvestissementCompleteDomainEvent implements IEvent {
  constructor(
    public readonly investissementId: string,
    public readonly projetId: string,
    public readonly utilisateurId: number,
    public readonly fractionsAjoutees: number,
    public readonly montantAjoute: number,
    /** Capital souscrit après complément. */
    public readonly montantTotal: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
