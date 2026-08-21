import type { EventBus } from '@nestjs/cqrs';
import {
  Reservation,
  ReservationSnapshot,
} from '../../domain/aggregates/reservation';
import { ReservationStatus } from '../../domain/enums/reservation-status.enum';
import {
  AnnulationReserveeAuTitulaireError,
  ReservationIntrouvableError,
  ReservationNonAnnulableError,
} from '../../domain/errors/reservation.errors';
import { ReservationAnnuleeDomainEvent } from '../../domain/events/reservation-annulee.domain-event';
import { CancelReservationUseCase } from './cancel-reservation.usecase';

const RESERVATION = '11111111-2222-3333-4444-555555555555';
const TITULAIRE = 42;

function reservationEn(statut: ReservationStatus): Reservation {
  const etat: ReservationSnapshot = {
    id: RESERVATION,
    projetId: '66666666-7777-8888-9999-000000000000',
    utilisateurId: TITULAIRE,
    montantReserve: 1_000,
    rangFile: 3,
    statut,
    confirmationJusquAu: null,
    investissementId: null,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    updatedAt: new Date('2026-08-01T10:00:00Z'),
  };
  return new Reservation(etat);
}

function makeDeps(reservation: Reservation | null) {
  const reservations = {
    creer: jest.fn(),
    save: jest.fn((r: Reservation) => Promise.resolve(r)),
    findById: jest.fn().mockResolvedValue(reservation),
    findByUserId: jest.fn(),
    findByProjetId: jest.fn(),
  };
  const eventBus = { publish: jest.fn() } as unknown as EventBus;
  const useCase = new CancelReservationUseCase(reservations, eventBus);
  return { useCase, reservations, eventBus };
}

describe('CancelReservationUseCase', () => {
  it('le titulaire annule : ANNULEE_USER, fait publié avec le motif', async () => {
    const { useCase, reservations, eventBus } = makeDeps(
      reservationEn(ReservationStatus.EN_ATTENTE),
    );

    const annulee = await useCase.execute(
      RESERVATION,
      TITULAIRE,
      false,
      'Changement de situation',
    );

    expect(annulee.statut).toBe(ReservationStatus.ANNULEE_USER);
    expect(reservations.save).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: RESERVATION,
        parAdministrateur: false,
        motif: 'Changement de situation',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(ReservationAnnuleeDomainEvent),
    );
  });

  it("l'admin annule sans être titulaire : ANNULEE_ADMIN", async () => {
    const { useCase } = makeDeps(reservationEn(ReservationStatus.VALIDEE));

    const annulee = await useCase.execute(RESERVATION, 999, true);

    expect(annulee.statut).toBe(ReservationStatus.ANNULEE_ADMIN);
  });

  it('refuse une réservation introuvable', async () => {
    const { useCase } = makeDeps(null);

    await expect(
      useCase.execute(RESERVATION, TITULAIRE, false),
    ).rejects.toBeInstanceOf(ReservationIntrouvableError);
  });

  it("refuse l'annulation par un autre que le titulaire, rien n'est persisté", async () => {
    const { useCase, reservations, eventBus } = makeDeps(
      reservationEn(ReservationStatus.EN_ATTENTE),
    );

    await expect(
      useCase.execute(RESERVATION, 999, false),
    ).rejects.toBeInstanceOf(AnnulationReserveeAuTitulaireError);
    expect(reservations.save).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuse une réservation déjà convertie, même pour un admin', async () => {
    const { useCase } = makeDeps(reservationEn(ReservationStatus.CONVERTIE));

    await expect(
      useCase.execute(RESERVATION, TITULAIRE, true),
    ).rejects.toBeInstanceOf(ReservationNonAnnulableError);
  });
});
