import { repartirAuPlusGrandReste } from './repartition';

const somme = (parts: number[]) =>
  Math.round(parts.reduce((total, p) => total + p, 0) * 100) / 100;

/**
 * « Toute somme distribuée est intégralement répartie, au centime. »
 *
 * Assertions STRICTES (`toBe`) et non `toBeCloseTo` : une tolérance masque
 * exactement le défaut qu'on cherche — un centime perdu à chaque période finit
 * par se voir au rapprochement, pas dans un test complaisant.
 */
describe('repartirAuPlusGrandReste', () => {
  describe('la somme des parts égale EXACTEMENT le total', () => {
    it.each([
      ['100 € entre 3 parts égales', 100, [1, 1, 1]],
      ['1000 € entre 7 parts égales', 1000, [1, 1, 1, 1, 1, 1, 1]],
      ['0,01 € entre 3', 0.01, [1, 1, 1]],
      ['33,33 € entre 3', 33.33, [1, 1, 1]],
      ['100 € au prorata 1/3/7', 100, [1, 3, 7]],
      ['1234,56 € entre 11', 1234.56, Array(11).fill(1)],
      ['999,99 € entre 13 poids inégaux', 999.99, [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9]],
      ['un seul ayant droit', 77.77, [5]],
    ])('%s', (_cas, total, poids) => {
      expect(somme(repartirAuPlusGrandReste(total, poids))).toBe(total);
    });

    it('vaut aussi pour un total NÉGATIF (moins-value)', () => {
      const parts = repartirAuPlusGrandReste(-100, [1, 1, 1]);
      expect(somme(parts)).toBe(-100);
    });
  });

  it('100 € entre 3 : les centimes restants sont attribués, pas perdus', () => {
    // Le calcul naïf donnait 33,33 × 3 = 99,99 €.
    expect(repartirAuPlusGrandReste(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
  });

  it('1000 € entre 7 : aucune part ne dévie de plus d’un centime de sa quote-part', () => {
    const parts = repartirAuPlusGrandReste(1000, Array(7).fill(1));

    expect(somme(parts)).toBe(1000);
    for (const part of parts) {
      expect(Math.abs(part - 1000 / 7)).toBeLessThanOrEqual(0.01);
    }
  });

  it('respecte le prorata des poids', () => {
    expect(repartirAuPlusGrandReste(100, [1, 3])).toEqual([25, 75]);
  });

  it('déterministe : à fraction égale, le rang le plus petit l’emporte', () => {
    const a = repartirAuPlusGrandReste(100, [1, 1, 1]);
    const b = repartirAuPlusGrandReste(100, [1, 1, 1]);

    expect(a).toEqual(b);
    // Le centime supplémentaire va au premier, pas au hasard.
    expect(a[0]).toBeGreaterThan(a[1]);
  });

  it('poids nuls : personne ne reçoit rien, aucune division par zéro', () => {
    expect(repartirAuPlusGrandReste(100, [0, 0])).toEqual([0, 0]);
  });

  it('un poids nul parmi d’autres ne reçoit rien', () => {
    const parts = repartirAuPlusGrandReste(100, [0, 1, 1]);

    expect(parts[0]).toBe(0);
    expect(somme(parts)).toBe(100);
  });

  it('aucun ayant droit : tableau vide', () => {
    expect(repartirAuPlusGrandReste(100, [])).toEqual([]);
  });

  it('total nul : que des zéros', () => {
    expect(repartirAuPlusGrandReste(0, [1, 2, 3])).toEqual([0, 0, 0]);
  });
});
