import {
  PLAFOND_PORTEUR_12_MOIS_EUR,
  debutFenetreGlissante,
  verifierPlafondPorteur,
} from './plafond-porteur';

const REFERENCE = new Date('2026-08-20T00:00:00Z');

describe('verifierPlafondPorteur — art. 1(2)(c)', () => {
  it('autorise une première offre sous le plafond', () => {
    const resultat = verifierPlafondPorteur([], 3_000_000, REFERENCE);
    expect(resultat.autorise).toBe(true);
    expect(resultat.dejaCollecte).toBe(0);
    expect(resultat.disponible).toBe(PLAFOND_PORTEUR_12_MOIS_EUR);
  });

  it('agrège les offres du porteur : trois collectes de 3 M€ dépassent le plafond', () => {
    const offres = [
      { montant: 3_000_000, ouverteLe: new Date('2026-02-01') },
      { montant: 3_000_000, ouverteLe: new Date('2026-05-01') },
    ];
    const resultat = verifierPlafondPorteur(offres, 3_000_000, REFERENCE);

    expect(resultat.dejaCollecte).toBe(6_000_000);
    expect(resultat.disponible).toBe(0);
    expect(resultat.autorise).toBe(false);
  });

  it('accepte exactement le plafond', () => {
    const offres = [{ montant: 2_000_000, ouverteLe: new Date('2026-03-01') }];
    expect(verifierPlafondPorteur(offres, 3_000_000, REFERENCE).autorise).toBe(true);
    expect(verifierPlafondPorteur(offres, 3_000_001, REFERENCE).autorise).toBe(false);
  });

  it('ignore les offres sorties de la fenêtre glissante', () => {
    const offres = [
      // Ouverte il y a plus de douze mois : hors fenêtre.
      { montant: 4_500_000, ouverteLe: new Date('2025-06-01') },
      { montant: 1_000_000, ouverteLe: new Date('2026-07-01') },
    ];
    const resultat = verifierPlafondPorteur(offres, 3_000_000, REFERENCE);

    expect(resultat.dejaCollecte).toBe(1_000_000);
    expect(resultat.autorise).toBe(true);
  });

  it('retient une offre située exactement au début de la fenêtre', () => {
    const debut = debutFenetreGlissante(REFERENCE);
    const resultat = verifierPlafondPorteur(
      [{ montant: 5_000_000, ouverteLe: debut }],
      1,
      REFERENCE,
    );
    expect(resultat.dejaCollecte).toBe(5_000_000);
    expect(resultat.autorise).toBe(false);
  });
});

describe('debutFenetreGlissante', () => {
  it('recule de douze mois', () => {
    expect(debutFenetreGlissante(REFERENCE).toISOString()).toBe(
      new Date('2025-08-20T00:00:00Z').toISOString(),
    );
  });
});
