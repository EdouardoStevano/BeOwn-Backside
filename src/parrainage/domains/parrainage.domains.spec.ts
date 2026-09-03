import {
  ALPHABET_CODE_PARRAINAGE,
  LONGUEUR_CODE_PARRAINAGE,
  estFormatCodeParrainage,
  genererCodeParrainage,
  normaliserCodeParrainage,
} from './code-parrainage';
import { calculerBonusParrainage } from './bonus-parrainage';

/**
 * Domaine pur du parrainage — aucun réseau, aucune base. Ces règles décident
 * qui touche de l'argent créé ex nihilo : chaque garde-fou est figé ici.
 */
describe('code-parrainage', () => {
  it('génère un code au format exact, déterministe sous générateur injecté', () => {
    const code = genererCodeParrainage(() => 0);
    expect(code).toBe('BEOWN-AAAAAA');
    expect(code).toHaveLength(LONGUEUR_CODE_PARRAINAGE);
    expect(estFormatCodeParrainage(code)).toBe(true);
  });

  it("l'alphabet exclut les caractères ambigus (I, L, O, 0, 1)", () => {
    for (const interdit of ['I', 'L', 'O', '0', '1']) {
      expect(ALPHABET_CODE_PARRAINAGE).not.toContain(interdit);
    }
  });

  it('normalise la saisie (espaces, casse) sans rien réparer d’autre', () => {
    expect(normaliserCodeParrainage('  beown-7km2qx ')).toBe('BEOWN-7KM2QX');
  });

  it.each(['BEOWN-7KM2QX', 'BEOWN-ZZZZZZ'])('accepte %s', (code) => {
    expect(estFormatCodeParrainage(code)).toBe(true);
  });

  it.each([
    ['préfixe absent', '7KM2QX'],
    ['suffixe trop court', 'BEOWN-7KM2Q'],
    ['caractère ambigu', 'BEOWN-7KM2Q1'],
    ['minuscules non normalisées', 'beown-7km2qx'],
    ['vide', ''],
  ])('refuse un code mal formé (%s)', (_cas, code) => {
    expect(estFormatCodeParrainage(code)).toBe(false);
  });
});

describe('bonus-parrainage', () => {
  it('1 % de 5 000 € sans historique → 50 €, non plafonné', () => {
    expect(calculerBonusParrainage(5000, 1, 0, 1500)).toEqual({
      montantEur: 50,
      plafonne: false,
    });
  });

  it('plafonne PARTIELLEMENT : le reliquat annuel est versé, pas refusé en bloc', () => {
    // Déjà 1 480 € perçus, bonus théorique 50 € → seuls 20 € restent.
    expect(calculerBonusParrainage(5000, 1, 1480, 1500)).toEqual({
      montantEur: 20,
      plafonne: true,
    });
  });

  it('enveloppe épuisée → 0 €, marqué plafonné', () => {
    expect(calculerBonusParrainage(5000, 1, 1500, 1500)).toEqual({
      montantEur: 0,
      plafonne: true,
    });
  });

  it('arrondit au centime', () => {
    expect(calculerBonusParrainage(333.33, 1, 0, 1500).montantEur).toBe(3.33);
  });

  it.each([
    ['montant négatif', -100, 1, 0, 1500],
    ['taux nul', 5000, 0, 0, 1500],
    ['plafond nul', 5000, 1, 0, 0],
    ['montant NaN', Number.NaN, 1, 0, 1500],
  ])(
    'entrée invalide (%s) → bonus NUL, jamais un montant fantaisiste',
    (_cas, montant, taux, percu, plafond) => {
      expect(
        calculerBonusParrainage(montant, taux, percu, plafond).montantEur,
      ).toBe(0);
    },
  );
});
