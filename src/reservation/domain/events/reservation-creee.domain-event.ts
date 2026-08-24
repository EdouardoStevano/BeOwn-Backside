import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * Un investisseur vient de verrouiller un engagement sur un projet ANNONCÉ :
 * la réservation est née, son rang est pris.
 *
 * Publié après persistance par `CreateReservationUseCase`. Abonnés attendus :
 * notifications (accusé de réservation) et, à terme, `treasury` pour le HOLD
 * des fonds (§3.4) — le verrouillage effectif du wallet n'est pas encore
 * branché sur ce fait.
 */
export class ReservationCreeeDomainEvent implements DomainEvent {
  constructor(
    public readonly reservationId: string,
    public readonly projetId: string,
    public readonly utilisateurId: number,
    public readonly montant: number,
    public readonly rang: number | null,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
