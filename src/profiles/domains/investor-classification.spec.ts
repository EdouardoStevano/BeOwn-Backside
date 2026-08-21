import {
  CategorieInvestisseur,
  calculerExpirationEvaluation,
  calculerSeuilAvertissement,
  determinerCategorie,
  evaluationExpiree,
  evaluerEligibiliteAvertiPersonneMorale,
  evaluerEligibiliteAvertiPersonnePhysique,
  simulerCapaciteDePerte,
} from './investor-classification';

describe('evaluerEligibiliteAvertiPersonnePhysique — annexe II, partie II', () => {
  const aucun = {
    revenuBrutAnnuel: 0,
    portefeuilleInstrumentsFinanciers: 0,
    experienceProfessionnelleFinanciere: false,
    transactionsMoyennesParTrimestre: 0,
  };

  it('exige au moins deux critères', () => {
    expect(evaluerEligibiliteAvertiPersonnePhysique(aucun).eligible).toBe(false);

    const unSeul = { ...aucun, revenuBrutAnnuel: 60_000 };
    expect(evaluerEligibiliteAvertiPersonnePhysique(unSeul).eligible).toBe(false);

    const deux = { ...unSeul, experienceProfessionnelleFinanciere: true };
    expect(evaluerEligibiliteAvertiPersonnePhysique(deux).eligible).toBe(true);
  });

  it('retient le revenu dès 60 000 € et le portefeuille au-dessus de 100 000 €', () => {
    const parRevenu = { ...aucun, revenuBrutAnnuel: 60_000 };
    expect(evaluerEligibiliteAvertiPersonnePhysique(parRevenu).criteresRemplis).toEqual([
      'revenu_brut_annuel',
    ]);

    const parPortefeuille = { ...aucun, portefeuilleInstrumentsFinanciers: 100_001 };
    expect(
      evaluerEligibiliteAvertiPersonnePhysique(parPortefeuille).criteresRemplis,
    ).toEqual(['portefeuille_instruments_financiers']);

    const portefeuilleExact = { ...aucun, portefeuilleInstrumentsFinanciers: 100_000 };
    expect(
      evaluerEligibiliteAvertiPersonnePhysique(portefeuilleExact).criteresRemplis,
    ).toEqual([]);
  });

  it('ne compte le premier critère qu\'une fois même si revenu et portefeuille sont atteints', () => {
    const lesDeux = {
      ...aucun,
      revenuBrutAnnuel: 80_000,
      portefeuilleInstrumentsFinanciers: 500_000,
    };
    const resultat = evaluerEligibiliteAvertiPersonnePhysique(lesDeux);
    expect(resultat.criteresRemplis).toHaveLength(1);
    expect(resultat.eligible).toBe(false);
  });

  it('retient les transactions à partir de 10 par trimestre', () => {
    const neuf = { ...aucun, transactionsMoyennesParTrimestre: 9 };
    expect(evaluerEligibiliteAvertiPersonnePhysique(neuf).criteresRemplis).toEqual([]);

    const dix = { ...aucun, transactionsMoyennesParTrimestre: 10 };
    expect(evaluerEligibiliteAvertiPersonnePhysique(dix).criteresRemplis).toEqual([
      'transactions_significatives',
    ]);
  });
});

describe('evaluerEligibiliteAvertiPersonneMorale — annexe II, partie I', () => {
  const aucun = { fondsPropres: 0, chiffreAffairesNet: 0, totalBilan: 0 };

  it('un seul critère suffit', () => {
    expect(evaluerEligibiliteAvertiPersonneMorale(aucun).eligible).toBe(false);
    expect(
      evaluerEligibiliteAvertiPersonneMorale({ ...aucun, fondsPropres: 100_000 }).eligible,
    ).toBe(true);
    expect(
      evaluerEligibiliteAvertiPersonneMorale({ ...aucun, totalBilan: 1_000_000 }).eligible,
    ).toBe(true);
  });
});

describe('simulerCapaciteDePerte — art. 21(5)', () => {
  it('calcule le patrimoine net puis 10 % de celui-ci', () => {
    const resultat = simulerCapaciteDePerte({
      revenuAnnuel: 40_000,
      actifsTotaux: 120_000,
      engagementsFinanciers: 60_000,
    });

    expect(resultat.patrimoineNet).toBe(100_000);
    expect(resultat.capaciteDePerte).toBe(10_000);
  });

  it('plancher le patrimoine net à zéro quand les engagements dépassent les avoirs', () => {
    const resultat = simulerCapaciteDePerte({
      revenuAnnuel: 10_000,
      actifsTotaux: 5_000,
      engagementsFinanciers: 90_000,
    });

    expect(resultat.patrimoineNet).toBe(0);
    expect(resultat.capaciteDePerte).toBe(0);
    expect(resultat.seuilAvertissement).toBe(1_000);
  });
});

describe('calculerSeuilAvertissement — art. 21(7)', () => {
  it('retient le plancher de 1 000 € pour les petits patrimoines', () => {
    expect(calculerSeuilAvertissement(0)).toBe(1_000);
    expect(calculerSeuilAvertissement(19_999)).toBe(1_000);
  });

  it('retient 5 % du patrimoine net au-delà de 20 000 €', () => {
    expect(calculerSeuilAvertissement(20_000)).toBe(1_000);
    expect(calculerSeuilAvertissement(200_000)).toBe(10_000);
  });
});

describe('determinerCategorie — art. 2(1)(j)', () => {
  it('le défaut est non averti', () => {
    expect(
      determinerCategorie({
        eligible: false,
        demandeExpresse: false,
        avertissementAccepte: false,
      }),
    ).toBe(CategorieInvestisseur.NON_AVERTI);
  });

  it('l\'éligibilité seule ne suffit pas : la demande expresse est requise', () => {
    expect(
      determinerCategorie({
        eligible: true,
        demandeExpresse: false,
        avertissementAccepte: true,
      }),
    ).toBe(CategorieInvestisseur.NON_AVERTI);
  });

  it('l\'avertissement doit être accepté', () => {
    expect(
      determinerCategorie({
        eligible: true,
        demandeExpresse: true,
        avertissementAccepte: false,
      }),
    ).toBe(CategorieInvestisseur.NON_AVERTI);
  });

  it('averti quand les trois conditions sont réunies', () => {
    expect(
      determinerCategorie({
        eligible: true,
        demandeExpresse: true,
        avertissementAccepte: true,
      }),
    ).toBe(CategorieInvestisseur.AVERTI);
  });
});

describe('validité de l\'évaluation — art. 21(2)', () => {
  it('expire vingt-quatre mois après l\'évaluation', () => {
    const evalueeLe = new Date('2026-01-15T00:00:00Z');
    expect(calculerExpirationEvaluation(evalueeLe).toISOString()).toBe(
      new Date('2028-01-15T00:00:00Z').toISOString(),
    );
  });

  it('considère expirée une évaluation absente', () => {
    expect(evaluationExpiree(null, new Date('2026-01-01'))).toBe(true);
  });

  it('compare correctement avant et après échéance', () => {
    const expireLe = new Date('2028-01-15T00:00:00Z');
    expect(evaluationExpiree(expireLe, new Date('2027-12-31'))).toBe(false);
    expect(evaluationExpiree(expireLe, new Date('2028-02-01'))).toBe(true);
  });
});
