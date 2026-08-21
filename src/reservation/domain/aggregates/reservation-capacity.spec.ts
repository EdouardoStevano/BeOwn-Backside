import { PlafondPreInvestissementAtteintError } from '../errors/reservation.errors';
import {
  FifoRankingPolicy,
  ReservationRankingPolicy,
} from '../policies/reservation-ranking.policy';
import { Rang } from '../value-objects/rang.vo';
import { ReservationCapacity } from './reservation-capacity';

const PROJET = '66666666-7777-8888-9999-000000000000';
const FIFO = new FifoRankingPolicy();

describe('ReservationCapacity (RG-RES-05, RG-RES-07)', () => {
  describe('allouer — le plafond', () => {
    it('accepte tant que le plafond n’est pas franchi, à l’euro près', () => {
      const capacite = ReservationCapacity.reconstituer({
        projetId: PROJET,
        plafond: 10_000,
        montantDejaReserve: 9_000,
        prochainRangChronologique: 4,
      });

      capacite.allouer(1_000, FIFO);

      expect(capacite.montantDejaReserve).toBe(10_000);
      expect(capacite.capaciteRestante).toBe(0);
    });

    it('refuse l’allocation qui franchirait le plafond (RG-RES-05)', () => {
      const capacite = ReservationCapacity.reconstituer({
        projetId: PROJET,
        plafond: 10_000,
        montantDejaReserve: 9_500,
        prochainRangChronologique: 4,
      });

      expect(() => capacite.allouer(501, FIFO)).toThrow(
        PlafondPreInvestissementAtteintError,
      );
      // Un refus ne consomme ni montant ni rang.
      expect(capacite.montantDejaReserve).toBe(9_500);
      expect(capacite.allouer(500, FIFO).valeur).toBe(4);
    });

    it('sans plafond configuré, la file est sans limite de montant', () => {
      const capacite = ReservationCapacity.vierge(PROJET, null);

      capacite.allouer(1_000_000, FIFO);

      expect(capacite.capaciteRestante).toBeNull();
    });
  });

  describe('allouer — le rang', () => {
    it('attribue des rangs strictement croissants, sans trou (FIFO)', () => {
      const capacite = ReservationCapacity.vierge(PROJET, null);

      const rangs = [100, 200, 300].map(
        (montant) => capacite.allouer(montant, FIFO).valeur,
      );

      expect(rangs).toEqual([1, 2, 3]);
    });

    it('reprend la file là où la persistance l’a laissée', () => {
      const capacite = ReservationCapacity.reconstituer({
        projetId: PROJET,
        plafond: null,
        montantDejaReserve: 5_000,
        prochainRangChronologique: 8,
      });

      expect(capacite.allouer(100, FIFO).valeur).toBe(8);
    });

    it('délègue l’attribution à la politique en vigueur (§22)', () => {
      // Le jour où le « critère de score » de §7.3.3 est clarifié, seule la
      // politique change — l'agrégat, lui, continue d'avancer sa chronologie.
      const parScore: ReservationRankingPolicy = {
        attribuer: ({ prochainRangChronologique, montant }) =>
          montant >= 10_000
            ? Rang.premier()
            : prochainRangChronologique,
      };
      const capacite = ReservationCapacity.reconstituer({
        projetId: PROJET,
        plafond: null,
        montantDejaReserve: 0,
        prochainRangChronologique: 5,
      });

      expect(capacite.allouer(20_000, parScore).valeur).toBe(1);
      expect(capacite.allouer(100, parScore).valeur).toBe(6);
    });
  });
});
