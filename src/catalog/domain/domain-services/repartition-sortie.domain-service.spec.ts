import { CapitalCibleInexploitableError } from '../errors/sortie.errors';
import {
  PartInvestisseur,
  RepartitionSortieService,
} from './repartition-sortie.domain-service';

const part = (
  investissementId: string,
  utilisateurId: number,
  montant: number,
): PartInvestisseur => ({ investissementId, utilisateurId, montant });

describe('RepartitionSortieService', () => {
  describe('plus-value', () => {
    // Deux investisseurs, 60 % / 40 % d'un capital cible de 100 000, sur une
    // plus-value nette de 10 000.
    const repartition = RepartitionSortieService.repartir(
      [part('i1', 1, 60_000), part('i2', 2, 40_000)],
      10_000,
      100_000,
    );

    it('répartit au prorata de la détention', () => {
      expect(repartition.quotesParts[0].plusValuePart).toBe(6_000);
      expect(repartition.quotesParts[1].plusValuePart).toBe(4_000);
    });

    it('rembourse le capital à l’identique', () => {
      expect(repartition.quotesParts[0].capitalRembourse).toBe(60_000);
      expect(repartition.quotesParts[1].capitalRembourse).toBe(40_000);
    });

    it('prélève 19 % d’IR et 17,2 % de prélèvements sociaux sur la plus-value', () => {
      expect(repartition.quotesParts[0].impotRevenu).toBe(1_140);
      expect(repartition.quotesParts[0].prelevementsSociaux).toBe(1_032);
    });

    it('verse le capital plus la plus-value nette de fiscalité', () => {
      // 60 000 + 6 000 − 1 140 − 1 032
      expect(repartition.quotesParts[0].netVerse).toBe(63_828);
    });

    it('totalise ce qui a été réparti', () => {
      expect(repartition.totalCapitalRembourse).toBe(100_000);
      expect(repartition.totalPlusValueDistribuee).toBe(10_000);
      expect(repartition.totalImpotRevenu).toBe(1_900);
      expect(repartition.totalPrelevementsSociaux).toBe(1_720);
    });
  });

  describe('moins-value', () => {
    const repartition = RepartitionSortieService.repartir(
      [part('i1', 1, 100_000)],
      -20_000,
      100_000,
    );

    it('ne prélève aucune fiscalité', () => {
      expect(repartition.quotesParts[0].impotRevenu).toBe(0);
      expect(repartition.quotesParts[0].prelevementsSociaux).toBe(0);
    });

    it('impute la perte sur le capital de l’investisseur', () => {
      expect(repartition.quotesParts[0].plusValuePart).toBe(-20_000);
      expect(repartition.quotesParts[0].netVerse).toBe(80_000);
    });
  });

  describe('sortie à l’équilibre', () => {
    it('rend le capital, rien de plus', () => {
      const repartition = RepartitionSortieService.repartir(
        [part('i1', 1, 50_000)],
        0,
        100_000,
      );
      expect(repartition.quotesParts[0].netVerse).toBe(50_000);
      expect(repartition.totalPlusValueDistribuee).toBe(0);
    });
  });

  describe('détention partielle', () => {
    it('ne distribue que la quote-part souscrite, même si la collecte est incomplète', () => {
      const repartition = RepartitionSortieService.repartir(
        [part('i1', 1, 25_000)],
        8_000,
        100_000,
      );
      expect(repartition.quotesParts[0].plusValuePart).toBe(2_000);
    });
  });

  describe('arrondis', () => {
    it('arrondit chaque ligne au centime', () => {
      const repartition = RepartitionSortieService.repartir(
        [part('i1', 1, 1)],
        1,
        3,
      );
      // 1/3 de 1 € = 0,3333… → 0,33
      expect(repartition.quotesParts[0].plusValuePart).toBe(0.33);
    });
  });

  it('refuse un capital cible nul — la quote-part serait indéfinie', () => {
    expect(() =>
      RepartitionSortieService.repartir([part('i1', 1, 100)], 10, 0),
    ).toThrow(CapitalCibleInexploitableError);
  });

  it('accepte une liste vide : rien à distribuer', () => {
    const repartition = RepartitionSortieService.repartir([], 10_000, 100_000);
    expect(repartition.quotesParts).toEqual([]);
    expect(repartition.totalCapitalRembourse).toBe(0);
  });
});
