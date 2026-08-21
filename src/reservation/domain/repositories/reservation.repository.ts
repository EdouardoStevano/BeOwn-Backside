import type {
  Reservation,
  ReservationNaissante,
} from '../aggregates/reservation';

export const RESERVATION_REPOSITORY = Symbol('RESERVATION_REPOSITORY');

/**
 * La collection des réservations (§10) — orientée agrégat, pas table.
 *
 * `creer` et `save` sont distincts parce que l'identité et les dates de vie
 * naissent en base : une `ReservationNaissante` entre, un agrégat complet
 * ressort. Les méthodes de requêtage brut de l'ancien port
 * (`countMontantReserveByProjet`, `getNextRangByProjet`) ont rejoint
 * `ReservationCapacityRepository` : c'étaient les deux moitiés de l'invariant
 * de capacité, pas des lectures de réservations. `findActiveByProjetId` et
 * `cancelAllByProjet`, sans appelant, sont partis avec.
 */
export interface ReservationRepository {
  /** Insère une réservation qui vient de naître et rend l'agrégat complet. */
  creer(naissante: ReservationNaissante): Promise<Reservation>;

  /** Persiste l'état d'une réservation existante (transition jouée). */
  save(reservation: Reservation): Promise<Reservation>;

  findById(id: string): Promise<Reservation | null>;

  findByUserId(userId: number): Promise<Reservation[]>;

  findByProjetId(projetId: string): Promise<Reservation[]>;
}
