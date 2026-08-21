import type { ReservationCapacity } from '../aggregates/reservation-capacity';

export const RESERVATION_CAPACITY_REPOSITORY = Symbol(
  'RESERVATION_CAPACITY_REPOSITORY',
);

/**
 * Charge la capacité de réservation d'un projet — l'agrégat qui protège
 * RG-RES-05 (plafond) et RG-RES-07 (rang) sur l'ensemble de la file (§6).
 *
 * Le plafond vient du projet (`catalog`, en amont) : c'est l'appelant qui le
 * fournit, la persistance de ce contexte ne connaît que les réservations. La
 * capacité est aujourd'hui *reconstituée* à chaque chargement (somme des
 * montants actifs, rang chronologique suivant) ; l'index unique
 * `(projetId, rangFile)` borne les courses d'allocation concurrentes en
 * attendant qu'elle devienne une ligne verrouillable par projet.
 */
export interface ReservationCapacityRepository {
  chargerParProjet(
    projetId: string,
    plafond: number | null,
  ): Promise<ReservationCapacity>;
}
