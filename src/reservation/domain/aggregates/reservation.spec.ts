import { ReservationStatus } from '../enums/reservation-status.enum';
import {
  AnnulationReserveeAuTitulaireError,
  ReservationDejaConvertieError,
  ReservationNonAnnulableError,
  ReservationNonConvertibleError,
  ReservationNonExpirableError,
  ReservationNonValidableError,
} from '../errors/reservation.errors';
import { Reservation, ReservationSnapshot } from './reservation';

const TITULAIRE = 42;
const AUTRE = 99;
const INVESTISSEMENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function reservationEn(statut: ReservationStatus): Reservation {
  const etat: ReservationSnapshot = {
    id: '11111111-2222-3333-4444-555555555555',
    projetId: '66666666-7777-8888-9999-000000000000',
    utilisateurId: TITULAIRE,
    montantReserve: 1_000,
    rangFile: 3,
    statut,
    confirmationJusquAu: null,
    investissementId:
      statut === ReservationStatus.CONVERTIE ? INVESTISSEMENT : null,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    updatedAt: new Date('2026-08-01T10:00:00Z'),
  };
  return new Reservation(etat);
}

describe('Reservation (agrégat du Core Domain)', () => {
  describe('annulerParInvestisseur', () => {
    it.each([ReservationStatus.EN_ATTENTE, ReservationStatus.VALIDEE])(
      'le titulaire annule une réservation %s',
      (statut) => {
        const reservation = reservationEn(statut);

        reservation.annulerParInvestisseur(TITULAIRE);

        expect(reservation.statut).toBe(ReservationStatus.ANNULEE_USER);
      },
    );

    it("refuse l'annulation par un autre que le titulaire", () => {
      const reservation = reservationEn(ReservationStatus.EN_ATTENTE);

      expect(() => reservation.annulerParInvestisseur(AUTRE)).toThrow(
        AnnulationReserveeAuTitulaireError,
      );
      expect(reservation.statut).toBe(ReservationStatus.EN_ATTENTE);
    });

    it.each([
      ReservationStatus.CONVERTIE,
      ReservationStatus.ANNULEE_USER,
      ReservationStatus.ANNULEE_ADMIN,
      ReservationStatus.EXPIRE,
    ])("refuse d'annuler une réservation %s", (statut) => {
      const reservation = reservationEn(statut);

      expect(() => reservation.annulerParInvestisseur(TITULAIRE)).toThrow(
        ReservationNonAnnulableError,
      );
    });
  });

  describe('annulerParAdministrateur', () => {
    it("annule sans exiger la titularité, avec le statut d'audit distinct", () => {
      const reservation = reservationEn(ReservationStatus.VALIDEE);

      reservation.annulerParAdministrateur();

      expect(reservation.statut).toBe(ReservationStatus.ANNULEE_ADMIN);
    });

    it("refuse d'annuler une réservation convertie", () => {
      const reservation = reservationEn(ReservationStatus.CONVERTIE);

      expect(() => reservation.annulerParAdministrateur()).toThrow(
        ReservationNonAnnulableError,
      );
    });
  });

  describe('valider', () => {
    it('fait passer une EN_ATTENTE en VALIDEE', () => {
      const reservation = reservationEn(ReservationStatus.EN_ATTENTE);

      reservation.valider();

      expect(reservation.statut).toBe(ReservationStatus.VALIDEE);
    });

    it.each([
      ReservationStatus.VALIDEE,
      ReservationStatus.CONVERTIE,
      ReservationStatus.ANNULEE_USER,
      ReservationStatus.EXPIRE,
    ])('refuse de valider une réservation %s', (statut) => {
      const reservation = reservationEn(statut);

      expect(() => reservation.valider()).toThrow(ReservationNonValidableError);
    });
  });

  describe('convertir — le différenciateur du produit', () => {
    it.each([ReservationStatus.EN_ATTENTE, ReservationStatus.VALIDEE])(
      "convertit une réservation %s et retient l'investissement",
      (statut) => {
        const reservation = reservationEn(statut);

        reservation.convertir(INVESTISSEMENT);

        expect(reservation.statut).toBe(ReservationStatus.CONVERTIE);
        expect(reservation.investissementId).toBe(INVESTISSEMENT);
      },
    );

    it('refuse la double conversion — un engagement, un investissement', () => {
      const reservation = reservationEn(ReservationStatus.EN_ATTENTE);
      reservation.convertir(INVESTISSEMENT);

      expect(() => reservation.convertir('autre-investissement')).toThrow(
        ReservationDejaConvertieError,
      );
      expect(reservation.investissementId).toBe(INVESTISSEMENT);
    });

    it.each([
      ReservationStatus.ANNULEE_USER,
      ReservationStatus.ANNULEE_ADMIN,
      ReservationStatus.EXPIRE,
    ])('refuse de convertir une réservation %s', (statut) => {
      const reservation = reservationEn(statut);

      expect(() => reservation.convertir(INVESTISSEMENT)).toThrow(
        ReservationNonConvertibleError,
      );
    });
  });

  describe('expirer', () => {
    it('fait expirer une EN_ATTENTE', () => {
      const reservation = reservationEn(ReservationStatus.EN_ATTENTE);

      reservation.expirer();

      expect(reservation.statut).toBe(ReservationStatus.EXPIRE);
    });

    it('refuse de faire expirer une réservation validée', () => {
      const reservation = reservationEn(ReservationStatus.VALIDEE);

      expect(() => reservation.expirer()).toThrow(ReservationNonExpirableError);
    });
  });

  describe('snapshot', () => {
    it("rend l'état complet, clés inchangées depuis l'ancien modèle", () => {
      const reservation = reservationEn(ReservationStatus.EN_ATTENTE);

      expect(reservation.snapshot()).toEqual({
        id: '11111111-2222-3333-4444-555555555555',
        projetId: '66666666-7777-8888-9999-000000000000',
        utilisateurId: TITULAIRE,
        montantReserve: 1_000,
        rangFile: 3,
        statut: ReservationStatus.EN_ATTENTE,
        confirmationJusquAu: null,
        investissementId: null,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:00:00Z'),
      });
    });
  });
});
