import type { IEvent } from '@nestjs/cqrs';

/**
 * Les réservations viennent d'ouvrir sur un projet : il est passé en `ANNONCE`.
 *
 * Deux chemins mènent à cet état — le bouton « publier l'annonce »
 * (`AdminProjectActionsController`) et le `PATCH /projects/:id/status`
 * générique. Les deux lèvent ce fait ; le dédoublonnage de la campagne qui
 * s'ensuit ne se joue pas ici mais dans `BroadcastService`, par un claim
 * atomique sur `broadcastAnnonceAt`. Un fait métier se produit à chaque
 * transition, même si l'annonce ne part qu'une fois.
 */
export class ProjetAnnonceDomainEvent implements IEvent {
  constructor(
    public readonly projetId: string,
    /**
     * Compte à l'origine de la transition. Tracé comme déclencheur audité de la
     * diffusion.
     */
    public readonly declenchePar: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
