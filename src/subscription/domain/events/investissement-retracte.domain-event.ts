import type { IEvent } from '@nestjs/cqrs';

/**
 * L'investisseur a exercé son droit de rétractation PSFP dans la fenêtre de
 * 4 jours : son engagement est retiré et son wallet recrédité intégralement.
 *
 * Les fractions qu'il occupait retournent de fait à la collecte — la capacité
 * se recalcule sur les investissements actifs (cf. `CollecteCapacity`).
 */
export class InvestissementRetracteDomainEvent implements IEvent {
  constructor(
    public readonly investissementId: string,
    public readonly projetId: string,
    public readonly utilisateurId: number,
    public readonly montantRembourse: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
