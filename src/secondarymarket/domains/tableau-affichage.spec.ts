import {
  PRIX_REFERENCE_CONTRAIGNANT,
  MENTION_NON_SYSTEME_DE_NEGOCIATION,
  verifierInteret,
} from './tableau-affichage';

describe('verifierInteret — art. 25', () => {
  const base = {
    acheteurId: 2,
    vendeurId: 1,
    nbFractionsDemandees: 3,
    nbFractionsDisponibles: 10,
  };

  it('accepte un intérêt cohérent', () => {
    expect(verifierInteret(base).recevable).toBe(true);
  });

  it('refuse un vendeur acquéreur de sa propre annonce', () => {
    expect(verifierInteret({ ...base, acheteurId: 1 }).recevable).toBe(false);
  });

  it('refuse une quantité nulle ou négative', () => {
    expect(verifierInteret({ ...base, nbFractionsDemandees: 0 }).recevable).toBe(false);
    expect(verifierInteret({ ...base, nbFractionsDemandees: -1 }).recevable).toBe(false);
  });

  it('refuse une quantité supérieure à l\'annonce', () => {
    expect(verifierInteret({ ...base, nbFractionsDemandees: 11 }).recevable).toBe(false);
  });

  it('accepte la totalité de l\'annonce', () => {
    expect(verifierInteret({ ...base, nbFractionsDemandees: 10 }).recevable).toBe(true);
  });
});

describe('mentions réglementaires — art. 25(2) et 25(4)', () => {
  it('le prix de référence n\'est pas contraignant', () => {
    expect(PRIX_REFERENCE_CONTRAIGNANT).toBe(false);
  });

  it('la mention nie explicitement l\'exploitation d\'un système de négociation', () => {
    expect(MENTION_NON_SYSTEME_DE_NEGOCIATION).toContain(
      "n'exploite pas un système de négociation",
    );
    expect(MENTION_NON_SYSTEME_DE_NEGOCIATION).toContain('appariée');
  });
});
