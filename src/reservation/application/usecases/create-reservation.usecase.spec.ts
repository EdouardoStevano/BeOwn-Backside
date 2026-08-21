import type { EventBus } from '@nestjs/cqrs';
import type { Project } from 'src/catalog/domain/aggregates/project';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import {
  Reservation,
  ReservationNaissante,
} from '../../domain/aggregates/reservation';
import { ReservationCapacity } from '../../domain/aggregates/reservation-capacity';
import { ReservationStatus } from '../../domain/enums/reservation-status.enum';
import {
  PlafondPreInvestissementAtteintError,
  ProjetHorsFenetreDePreInvestissementError,
  ProjetIntrouvableError,
  TicketSousLeMinimumError,
} from '../../domain/errors/reservation.errors';
import { ReservationCreeeDomainEvent } from '../../domain/events/reservation-creee.domain-event';
import { FifoRankingPolicy } from '../../domain/policies/reservation-ranking.policy';
import { CreateReservationUseCase } from './create-reservation.usecase';

const PROJET = '66666666-7777-8888-9999-000000000000';
const UTILISATEUR = 42;

/**
 * Le double du projet amont : la vue que `ProjetReservableTranslator` lit sur
 * l'agrégat de `catalog` — uniquement les six accesseurs traduits (§13).
 */
function projetCatalogue(surcharges: Record<string, unknown> = {}): Project {
  return {
    id: PROJET,
    statut: ProjectStatus.ANNONCE,
    estPreInvestissable: true,
    ticketMinimum: 100,
    ticketMaximum: 10_000,
    plafondPreInvestissement: 50_000,
    ...surcharges,
  } as unknown as Project;
}

function makeDeps(options: {
  projet: Project | null;
  dejaReserve?: number;
  prochainRang?: number;
}) {
  const reservations = {
    creer: jest.fn((naissante: ReservationNaissante) =>
      Promise.resolve(
        new Reservation({
          ...naissante,
          id: '11111111-2222-3333-4444-555555555555',
          createdAt: new Date('2026-08-21T10:00:00Z'),
          updatedAt: new Date('2026-08-21T10:00:00Z'),
        }),
      ),
    ),
    save: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findByProjetId: jest.fn(),
  };
  const capacites = {
    chargerParProjet: jest.fn((projetId: string, plafond: number | null) =>
      Promise.resolve(
        ReservationCapacity.reconstituer({
          projetId,
          plafond,
          montantDejaReserve: options.dejaReserve ?? 0,
          prochainRangChronologique: options.prochainRang ?? 1,
        }),
      ),
    ),
  };
  const projets = {
    findProjectById: jest.fn().mockResolvedValue(options.projet),
  };
  const eventBus = { publish: jest.fn() } as unknown as EventBus;

  const useCase = new CreateReservationUseCase(
    reservations,
    capacites,
    projets as never,
    new FifoRankingPolicy(),
    eventBus,
  );
  return { useCase, reservations, capacites, projets, eventBus };
}

describe('CreateReservationUseCase', () => {
  it('réserve : traduit le projet, alloue le rang, persiste, publie le fait', async () => {
    const { useCase, reservations, eventBus } = makeDeps({
      projet: projetCatalogue(),
      prochainRang: 7,
    });

    const reservation = await useCase.execute(UTILISATEUR, {
      projetId: PROJET,
      montant: 1_000,
    });

    expect(reservations.creer).toHaveBeenCalledWith({
      projetId: PROJET,
      utilisateurId: UTILISATEUR,
      montantReserve: 1_000,
      rangFile: 7,
      statut: ReservationStatus.EN_ATTENTE,
      confirmationJusquAu: null,
      investissementId: null,
    });
    expect(reservation.rang?.valeur).toBe(7);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(ReservationCreeeDomainEvent),
    );
  });

  it('refuse un projet introuvable, sans toucher à la file', async () => {
    const { useCase, capacites, reservations } = makeDeps({ projet: null });

    await expect(
      useCase.execute(UTILISATEUR, { projetId: PROJET, montant: 1_000 }),
    ).rejects.toBeInstanceOf(ProjetIntrouvableError);
    expect(capacites.chargerParProjet).not.toHaveBeenCalled();
    expect(reservations.creer).not.toHaveBeenCalled();
  });

  it('refuse un projet sorti de la fenêtre ANNONCÉ', async () => {
    const { useCase, reservations, eventBus } = makeDeps({
      projet: projetCatalogue({ statut: ProjectStatus.EN_COLLECTE }),
    });

    await expect(
      useCase.execute(UTILISATEUR, { projetId: PROJET, montant: 1_000 }),
    ).rejects.toBeInstanceOf(ProjetHorsFenetreDePreInvestissementError);
    expect(reservations.creer).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuse un ticket sous le minimum, rien n’est persisté ni publié', async () => {
    const { useCase, reservations, eventBus } = makeDeps({
      projet: projetCatalogue(),
    });

    await expect(
      useCase.execute(UTILISATEUR, { projetId: PROJET, montant: 50 }),
    ).rejects.toBeInstanceOf(TicketSousLeMinimumError);
    expect(reservations.creer).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuse quand le plafond du projet est atteint (RG-RES-05)', async () => {
    const { useCase } = makeDeps({
      projet: projetCatalogue({ plafondPreInvestissement: 10_000 }),
      dejaReserve: 9_800,
    });

    await expect(
      useCase.execute(UTILISATEUR, { projetId: PROJET, montant: 500 }),
    ).rejects.toBeInstanceOf(PlafondPreInvestissementAtteintError);
  });
});
