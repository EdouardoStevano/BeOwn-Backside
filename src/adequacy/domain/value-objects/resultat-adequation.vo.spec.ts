import { CategoriePsfp } from 'src/adequacy/domain/enums/categorie-psfp.enum';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/adequacy/domain/domain-services/plafond-psfp.domain-service';
import { CapaciteDePerte } from './capacite-de-perte.vo';
import { PreQualificationPsfp } from './pre-qualification-psfp.vo';
import { QualificationPsfp } from './qualification-psfp.vo';
import { ResultatAdequation } from './resultat-adequation.vo';

const AUCUN_CRITERE_PRO = PreQualificationPsfp.declarer({});
const AUCUN_CRITERE_AVERTI = QualificationPsfp.declarer({});
const SANS_PATRIMOINE = CapaciteDePerte.declarer({});

const classer = (
  preQualification = AUCUN_CRITERE_PRO,
  qualification = AUCUN_CRITERE_AVERTI,
  capacite = SANS_PATRIMOINE,
) => ResultatAdequation.calculer(preQualification, qualification, capacite);

describe('ResultatAdequation.calculer — étape 1, pré-qualification', () => {
  it('classe professionnel dès deux critères sur trois', () => {
    const resultat = classer(
      PreQualificationPsfp.declarer({
        workInFinancialSector: true,
        portfolioOver500k: true,
      }),
    );

    expect(resultat.categorie).toBe(CategoriePsfp.PROFESSIONNEL);
    // Le professionnel n'est pas plafonné : ni délai de rétractation, ni
    // montant conseillé.
    expect(resultat.montantMaxConseille).toBeNull();
  });

  it('ne classe pas professionnel avec un seul critère', () => {
    const resultat = classer(
      PreQualificationPsfp.declarer({ workInFinancialSector: true }),
    );

    expect(resultat.categorie).toBe(CategoriePsfp.NON_AVERTI);
  });

  it("l'emporte sur l'étape 2, même critères d'averti réunis", () => {
    // Un titulaire peut satisfaire les deux étapes ; l'ordre n'est pas un
    // détail d'implémentation, c'est la première qui décide.
    const resultat = classer(
      PreQualificationPsfp.declarer({
        workInFinancialSector: true,
        moreThan10TransactionsPerQuarter: true,
      }),
      QualificationPsfp.declarer({
        previousUnlistedInvestments: true,
        investmentExperienceOver5Years: true,
        financialPatrimonyOver500k: true,
        understandsTotalLossRisk: true,
        financialSectorBackground: true,
      }),
    );

    expect(resultat.categorie).toBe(CategoriePsfp.PROFESSIONNEL);
  });
});

describe('ResultatAdequation.calculer — étape 2, qualification', () => {
  it('classe averti à quatre critères sur cinq', () => {
    const resultat = classer(
      AUCUN_CRITERE_PRO,
      QualificationPsfp.declarer({
        previousUnlistedInvestments: true,
        investmentExperienceOver5Years: true,
        financialPatrimonyOver500k: true,
        understandsTotalLossRisk: true,
      }),
    );

    expect(resultat.categorie).toBe(CategoriePsfp.AVERTI);
    expect(resultat.montantMaxConseille).toBeNull();
  });

  it('reste non averti à trois critères sur cinq', () => {
    const resultat = classer(
      AUCUN_CRITERE_PRO,
      QualificationPsfp.declarer({
        previousUnlistedInvestments: true,
        investmentExperienceOver5Years: true,
        understandsTotalLossRisk: true,
      }),
    );

    expect(resultat.categorie).toBe(CategoriePsfp.NON_AVERTI);
  });
});

describe('ResultatAdequation.calculer — étape 3, capacité de perte', () => {
  it('conseille 5 % du patrimoine au non-averti', () => {
    const resultat = classer(
      AUCUN_CRITERE_PRO,
      AUCUN_CRITERE_AVERTI,
      CapaciteDePerte.declarer({ patrimoineNet: 400_000 }),
    );

    expect(resultat.montantMaxConseille).toBe(20_000);
  });

  it('retient le plancher réglementaire pour un patrimoine modeste', () => {
    const resultat = classer(
      AUCUN_CRITERE_PRO,
      AUCUN_CRITERE_AVERTI,
      CapaciteDePerte.declarer({ patrimoineNet: 5_000 }),
    );

    expect(resultat.montantMaxConseille).toBe(PLANCHER_PLAFOND_NON_AVERTI);
  });

  it("retient le plancher quand rien n'a été déclaré", () => {
    expect(classer().montantMaxConseille).toBe(PLANCHER_PLAFOND_NON_AVERTI);
  });
});

describe('ResultatAdequation.restore', () => {
  it("rend la décision telle qu'elle a été prise, sans la recalculer", () => {
    // Rejouer le classement à la lecture ferait changer rétroactivement la
    // catégorie de tout le monde le jour où un seuil réglementaire bouge.
    const resultat = ResultatAdequation.restore({
      resultCategorie: CategoriePsfp.PROFESSIONNEL,
      resultMontantMaxConseille: null,
    });

    expect(resultat.estProfessionnel()).toBe(true);
  });

  it('convertit le décimal que Postgres rend en chaîne', () => {
    const resultat = ResultatAdequation.restore({
      resultCategorie: CategoriePsfp.NON_AVERTI,
      resultMontantMaxConseille: '20000.00',
    });

    expect(resultat.montantMaxConseille).toBe(20_000);
  });

  it('tolère une ligne antérieure au classement', () => {
    const resultat = ResultatAdequation.restore({
      resultCategorie: null,
      resultMontantMaxConseille: null,
    });

    expect(resultat.categorie).toBeNull();
    expect(resultat.estProfessionnel()).toBe(false);
  });
});
