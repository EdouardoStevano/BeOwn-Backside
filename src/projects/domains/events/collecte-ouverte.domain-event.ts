import type { IEvent } from '@nestjs/cqrs';

/**
 * La collecte vient d'ouvrir sur un projet : il est passé en `EN_COLLECTE`.
 *
 * C'est le fait qui déclenche la campagne « nouveau projet » — in-app aux
 * comptes actifs, email et SMS selon les préférences. Comme pour
 * {@link ProjetAnnonceDomainEvent}, le dédoublonnage appartient à
 * `BroadcastService` (claim atomique sur `broadcastCollecteAt`), pas à
 * l'émission du fait.
 */
export class CollecteOuverteDomainEvent implements IEvent {
  constructor(
    public readonly projetId: string,
    /** Compte à l'origine de la transition, tracé pour l'audit. */
    public readonly declenchePar: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
