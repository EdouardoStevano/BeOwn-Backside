import { ReservationCapacity } from '../aggregates/reservation-capacity';
import { ReservationStatus } from '../enums/reservation-status.enum';
import {
  MontantReserveInvalideError,
  PlafondPreInvestissementAtteintError,
  PreInvestissementNonActiveError,
  ProjetHorsFenetreDePreInvestissementError,
  TicketAuDessusDuMaximumError,
  TicketSousLeMinimumError,
} from '../errors/reservation.errors';
import { FifoRankingPolicy } from '../policies/reservation-ranking.policy';
import type { ProjetReservable } from '../value-objects/projet-reservable';
import { ReservationFactory } from './reservation.factory';

const PROJET = '66666666-7777-8888-9999-000000000000';
const FIFO = new FifoRankingPolicy();

function projetReservable(
  surcharges: Partial<ProjetReservable> = {},
): ProjetReservable {
  return {
    projetId: PROJET,
    enPhaseAnnonce: true,
    preInvestissementActive: true,
    ticketMinimum: 100,
    ticketMaximum: 10_000,
    plafondPreInvestissement: 50_000,
    ...surcharges,
  };
}

function creer(
  montant: number,
  projet: ProjetReservable = projetReservable(),
  capacite = ReservationCapacity.vierge(PROJET, projet.plafondPreInvestissement),
) {
  return ReservationFactory.creer(
    { projet, utilisateurId: 42, montant },
    capacite,
    FIFO,
  );
}

describe('ReservationFactory (§23) — les portes de la naissance', () => {
  it('fait naître EN_ATTENTE, avec le rang alloué par la capacité', () => {
    const naissante = creer(1_000);

    expect(naissante).toEqual({
      projetId: PROJET,
      utilisateurId: 42,
      montantReserve: 1_000,
      rangFile: 1,
      statut: ReservationStatus.EN_ATTENTE,
      confirmationJusquAu: null,
      investissementId: null,
    });
  });

  it('refuse un projet hors de la fenêtre ANNONCÉ', () => {
    expect(() =>
      creer(1_000, projetReservable({ enPhaseAnnonce: false })),
    ).toThrow(ProjetHorsFenetreDePreInvestissementError);
  });

  it('refuse un projet dont le pré-investissement n’est pas activé', () => {
    expect(() =>
      creer(1_000, projetReservable({ preInvestissementActive: false })),
    ).toThrow(PreInvestissementNonActiveError);
  });

  it.each([0, -50, NaN])('refuse un montant %p', (montant) => {
    expect(() => creer(montant)).toThrow(MontantReserveInvalideError);
  });

  it('refuse un ticket sous le minimum du projet (RG-INV-02)', () => {
    expect(() => creer(99)).toThrow(TicketSousLeMinimumError);
  });

  it('refuse un ticket au-dessus du maximum du projet (RG-INV-03)', () => {
    expect(() => creer(10_001)).toThrow(TicketAuDessusDuMaximumError);
  });

  it('sans ticket maximum, seule la borne basse s’applique', () => {
    const naissante = creer(
      25_000,
      projetReservable({ ticketMaximum: null }),
    );

    expect(naissante.montantReserve).toBe(25_000);
  });

  it('laisse la capacité refuser le plafond (RG-RES-05)', () => {
    const projet = projetReservable({ plafondPreInvestissement: 5_000 });
    const capacite = ReservationCapacity.reconstituer({
      projetId: PROJET,
      plafond: 5_000,
      montantDejaReserve: 4_500,
      prochainRangChronologique: 9,
    });

    expect(() => creer(1_000, projet, capacite)).toThrow(
      PlafondPreInvestissementAtteintError,
    );
  });

  it('deux naissances successives prennent deux rangs successifs (RG-RES-07)', () => {
    const capacite = ReservationCapacity.vierge(PROJET, null);
    const projet = projetReservable({ plafondPreInvestissement: null });

    const premiere = creer(1_000, projet, capacite);
    const seconde = creer(2_000, projet, capacite);

    expect(premiere.rangFile).toBe(1);
    expect(seconde.rangFile).toBe(2);
  });
});
