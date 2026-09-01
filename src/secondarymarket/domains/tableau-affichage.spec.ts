import {
  PRIX_REFERENCE_CONTRAIGNANT,
  MENTION_NON_SYSTEME_DE_NEGOCIATION,
  CODE_DETENTION_TROP_RECENTE,
  CODE_PROJET_NON_ELIGIBLE,
  DUREE_DETENTION_MINIMALE_MOIS,
  calculerAssietteCession,
  dateCessibiliteMinimale,
  estAnnonceEchue,
  finDeValidite,
  jourLimiteValidite,
  verifierEligibiliteMiseEnVente,
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

describe('dateCessibiliteMinimale — calcul calendaire', () => {
  it('ajoute six mois pleins', () => {
    expect(dateCessibiliteMinimale(new Date(2026, 1, 15, 12))).toEqual(
      new Date(2026, 7, 15, 12),
    );
  });

  it('borne le jour au dernier jour du mois cible (31 août → 28 février)', () => {
    // Sans bornage, un 31 août + 6 mois déborderait sur le 3 mars.
    expect(dateCessibiliteMinimale(new Date(2026, 7, 31, 12))).toEqual(
      new Date(2027, 1, 28, 12),
    );
  });

  it('respecte une année bissextile (31 août 2027 → 29 février 2028)', () => {
    expect(dateCessibiliteMinimale(new Date(2027, 7, 31, 12))).toEqual(
      new Date(2028, 1, 29, 12),
    );
  });

  it('franchit correctement le changement d\'année', () => {
    expect(dateCessibiliteMinimale(new Date(2026, 9, 10, 12))).toEqual(
      new Date(2027, 3, 10, 12),
    );
  });
});

describe('verifierEligibiliteMiseEnVente — bornes de détention', () => {
  const acquisition = new Date(2026, 1, 15, 12); // 15 février 2026
  const enExploitation = 'en_exploitation';

  const verdictAu = (maintenant: Date) =>
    verifierEligibiliteMiseEnVente({
      dateAcquisition: acquisition,
      statutProjet: enExploitation,
      maintenant,
    });

  it('la durée minimale est bien de six mois', () => {
    expect(DUREE_DETENTION_MINIMALE_MOIS).toBe(6);
  });

  it('six mois moins un jour : refus SECONDARY_HOLDING_TOO_RECENT', () => {
    const verdict = verdictAu(new Date(2026, 7, 14, 12));
    expect(verdict.eligible).toBe(false);
    expect(verdict.code).toBe(CODE_DETENTION_TROP_RECENTE);
    expect(verdict.motif).toContain('6 mois');
  });

  it('six mois pile : accepté', () => {
    const verdict = verdictAu(new Date(2026, 7, 15, 12));
    expect(verdict.eligible).toBe(true);
    expect(verdict.code).toBeNull();
  });

  it('six mois plus un jour : accepté', () => {
    expect(verdictAu(new Date(2026, 7, 16, 12)).eligible).toBe(true);
  });

  it('expose toujours la date de cessibilité, y compris en cas de refus', () => {
    expect(verdictAu(new Date(2026, 7, 14, 12)).cessibleAPartirDu).toEqual(
      new Date(2026, 7, 15, 12),
    );
    expect(verdictAu(new Date(2026, 7, 16, 12)).cessibleAPartirDu).toEqual(
      new Date(2026, 7, 15, 12),
    );
  });
});

describe('verifierEligibiliteMiseEnVente — état du projet', () => {
  const detentionAncienne = {
    dateAcquisition: new Date(2020, 0, 1, 12),
    maintenant: new Date(2026, 0, 1, 12),
  };

  it.each([
    ['brouillon'],
    ['annonce'],
    ['pre_investissement'],
    ['en_collecte'],
    ['finance'],
    ['cloture'],
    ['echec'],
    ['annule'],
  ])('refuse un projet en statut %s', (statutProjet) => {
    const verdict = verifierEligibiliteMiseEnVente({
      ...detentionAncienne,
      statutProjet,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.code).toBe(CODE_PROJET_NON_ELIGIBLE);
  });

  it('accepte un projet en exploitation détenu depuis longtemps', () => {
    expect(
      verifierEligibiliteMiseEnVente({
        ...detentionAncienne,
        statutProjet: 'en_exploitation',
      }).eligible,
    ).toBe(true);
  });

  it('quand les deux conditions manquent, le projet prime (cause non corrigeable par l\'attente)', () => {
    const verdict = verifierEligibiliteMiseEnVente({
      dateAcquisition: new Date(2026, 0, 1, 12),
      statutProjet: 'en_collecte',
      maintenant: new Date(2026, 0, 2, 12),
    });
    expect(verdict.code).toBe(CODE_PROJET_NON_ELIGIBLE);
  });
});

describe('calculerAssietteCession — assiette des frais', () => {
  it('calcule le montant brut et la plus-value', () => {
    expect(
      calculerAssietteCession({
        nbFractions: 10,
        prixUnitaire: 120,
        prixRevientUnitaire: 100,
      }),
    ).toEqual({ montantBrut: 1200, plusValueVendeur: 200 });
  });

  it('plancher à zéro sur une moins-value (aucun frais de gain)', () => {
    expect(
      calculerAssietteCession({
        nbFractions: 10,
        prixUnitaire: 80,
        prixRevientUnitaire: 100,
      }),
    ).toEqual({ montantBrut: 800, plusValueVendeur: 0 });
  });

  it('prix de revient inconnu : plus-value réputée nulle, jamais devinée', () => {
    expect(
      calculerAssietteCession({
        nbFractions: 10,
        prixUnitaire: 120,
        prixRevientUnitaire: null,
      }),
    ).toEqual({ montantBrut: 1200, plusValueVendeur: 0 });
  });

  it('arrondit au centime', () => {
    expect(
      calculerAssietteCession({
        nbFractions: 3,
        prixUnitaire: 33.333,
        prixRevientUnitaire: 33.331,
      }),
    ).toEqual({ montantBrut: 100, plusValueVendeur: 0.01 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Durée de validité d'une annonce
//
// L'échéance était portée par la colonne `valideJusquAu` sans qu'aucun chemin
// ne la lise : une annonce périmée restait affichée, sollicitable et cessible.
// La règle vit désormais ici, en fonction pure, et c'est elle que la liste
// publique, l'expression d'intérêt et le cron d'expiration appliquent.
// ═══════════════════════════════════════════════════════════════════════════

describe('estAnnonceEchue — une annonce périmée n\'est plus cessible', () => {
  it("sans date de validité, l'annonce ne périme jamais", () => {
    expect(estAnnonceEchue(null, new Date('2099-01-01T00:00:00Z'))).toBe(false);
    expect(estAnnonceEchue(undefined, new Date('2099-01-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it("l'annonce reste valable pendant TOUT son dernier jour", () => {
    // Valable jusqu'au 31 août : encore cessible à 23:59:59 ce jour-là.
    expect(
      estAnnonceEchue('2026-08-31', new Date('2026-08-31T23:59:59.000Z')),
    ).toBe(false);
    expect(
      estAnnonceEchue('2026-08-31', new Date('2026-08-31T00:00:00.000Z')),
    ).toBe(false);
  });

  it('elle est échue dès le jour suivant', () => {
    expect(
      estAnnonceEchue('2026-08-31', new Date('2026-09-01T00:00:00.000Z')),
    ).toBe(true);
  });

  it('accepte indifféremment une chaîne `YYYY-MM-DD` ou un objet Date', () => {
    const maintenant = new Date('2026-09-01T08:00:00.000Z');
    expect(estAnnonceEchue('2026-08-31', maintenant)).toBe(true);
    expect(estAnnonceEchue(new Date('2026-08-31T00:00:00Z'), maintenant)).toBe(
      true,
    );
  });

  it('finDeValidite borne au dernier millième de seconde du jour', () => {
    expect(finDeValidite('2026-08-31').toISOString()).toBe(
      '2026-08-31T23:59:59.999Z',
    );
  });

  it('jourLimiteValidite donne le plancher de la clause SQL', () => {
    expect(jourLimiteValidite(new Date('2026-08-31T22:00:00.000Z'))).toBe(
      '2026-08-31',
    );
  });

  it("le plancher SQL et la règle métier s'accordent sur la même annonce", () => {
    // Une annonce dont `valideJusquAu` vaut exactement le plancher SQL est
    // servie par la requête ET jugée non échue : aucun écart entre ce que la
    // liste publie et ce que l'expression d'intérêt accepte.
    const maintenant = new Date('2026-08-31T22:00:00.000Z');
    const plancher = jourLimiteValidite(maintenant);
    expect(estAnnonceEchue(plancher, maintenant)).toBe(false);
  });
});
