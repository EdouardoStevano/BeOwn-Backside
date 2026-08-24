import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * Une réservation active vient d'être retirée de la file — par son titulaire
 * ou par le back-office (le statut final distingue les deux).
 *
 * Le rang et le montant qu'elle occupait sont libérés de fait : la capacité
 * se recalcule sur les réservations actives (RG-RES-05).
 */
export class ReservationAnnuleeDomainEvent implements DomainEvent {
  constructor(
    public readonly reservationId: string,
    public readonly projetId: string,
    public readonly utilisateurId: number,
    public readonly montant: number,
    public readonly parAdministrateur: boolean,
    public readonly motif: string | null,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
