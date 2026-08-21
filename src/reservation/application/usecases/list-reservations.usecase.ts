import { Inject, Injectable } from '@nestjs/common';
import type { Reservation } from '../../domain/aggregates/reservation';
import type { ReservationRepository } from '../../domain/repositories/reservation.repository';
import { RESERVATION_REPOSITORY } from '../../domain/repositories/reservation.repository';

/**
 * Queries de lecture (§11) : la présentation ne parle qu'aux use cases, plus
 * jamais aux repositories — le contrôleur injectait `RESERVATION_REPOSITORY`
 * directement pour ses deux listes.
 */
@Injectable()
export class ListUserReservationsUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepository,
  ) {}

  execute(utilisateurId: number): Promise<Reservation[]> {
    return this.reservations.findByUserId(utilisateurId);
  }
}

@Injectable()
export class ListProjectReservationsUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepository,
  ) {}

  execute(projetId: string): Promise<Reservation[]> {
    return this.reservations.findByProjetId(projetId);
  }
}
