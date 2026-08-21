import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { Reservation } from '../../domain/aggregates/reservation';
import { ReservationAnnuleeDomainEvent } from '../../domain/events/reservation-annulee.domain-event';
import { ReservationIntrouvableError } from '../../domain/errors/reservation.errors';
import type { ReservationRepository } from '../../domain/repositories/reservation.repository';
import { RESERVATION_REPOSITORY } from '../../domain/repositories/reservation.repository';

/**
 * **Annuler une réservation** — par son titulaire ou par le back-office.
 *
 * Qui a le droit d'annuler quoi, et depuis quel état, appartient à l'agrégat
 * ({@link Reservation.annulerParInvestisseur} /
 * {@link Reservation.annulerParAdministrateur}) : l'ancienne liste d'états
 * annulables et le test de titularité vivaient ici, en clair dans
 * l'application (§14).
 *
 * Le `motif` accompagne le fait publié mais n'est pas encore persisté sur la
 * réservation — comportement inchangé de l'ancienne version, qui l'acceptait
 * déjà dans le DTO sans le stocker.
 */
@Injectable()
export class CancelReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    reservationId: string,
    utilisateurId: number,
    parAdministrateur = false,
    motif?: string,
  ): Promise<Reservation> {
    const reservation = await this.reservations.findById(reservationId);
    if (!reservation) {
      throw new ReservationIntrouvableError(reservationId);
    }

    if (parAdministrateur) {
      reservation.annulerParAdministrateur();
    } else {
      reservation.annulerParInvestisseur(utilisateurId);
    }

    const annulee = await this.reservations.save(reservation);

    this.eventBus.publish(
      new ReservationAnnuleeDomainEvent(
        annulee.id,
        annulee.projetId,
        annulee.utilisateurId,
        annulee.montantReserve,
        parAdministrateur,
        motif ?? null,
      ),
    );

    return annulee;
  }
}
