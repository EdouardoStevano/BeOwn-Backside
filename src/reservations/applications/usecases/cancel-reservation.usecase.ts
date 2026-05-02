import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RESERVATION_REPOSITORY } from '../ports/repositories/reservation.repository';
import type { ReservationRepository } from '../ports/repositories/reservation.repository';
import { Reservation } from 'src/reservations/domains/reservation';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';

@Injectable()
export class CancelReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
  ) {}

  async execute(
    reservationId: string,
    userId: number,
    byAdmin = false,
    motif?: string,
  ): Promise<Reservation> {
    const reservation =
      await this.reservationRepository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    if (!byAdmin && reservation.utilisateurId !== userId) {
      throw new BadRequestException(
        'Vous ne pouvez pas annuler cette réservation.',
      );
    }

    const cancellable = [
      ReservationStatus.EN_ATTENTE,
      ReservationStatus.VALIDEE,
    ];
    if (!cancellable.includes(reservation.statut)) {
      throw new BadRequestException(
        'Cette réservation ne peut pas être annulée.',
      );
    }

    reservation.statut = byAdmin
      ? ReservationStatus.ANNULEE_ADMIN
      : ReservationStatus.ANNULEE_USER;

    // TODO: Store motif when reservation domain model is updated

    return this.reservationRepository.update(reservation);
  }
}
