import { Reservation } from 'src/reservations/domains/reservation';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';

export const RESERVATION_REPOSITORY = Symbol('RESERVATION_REPOSITORY');

export interface ReservationRepository {
  save(reservation: Reservation): Promise<Reservation>;
  findById(id: string): Promise<Reservation | null>;
  findByUserId(userId: number): Promise<Reservation[]>;
  findByProjetId(projetId: string): Promise<Reservation[]>;
  findActiveByProjetId(projetId: string): Promise<Reservation[]>;
  countMontantReserveByProjet(projetId: string): Promise<number>;
  getNextRangByProjet(projetId: string): Promise<number>;
  update(reservation: Reservation): Promise<Reservation>;
  cancelAllByProjet(projetId: string, motif: ReservationStatus): Promise<void>;
}
