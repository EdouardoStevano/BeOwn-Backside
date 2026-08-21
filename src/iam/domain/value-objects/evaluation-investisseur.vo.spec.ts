import { EvaluationInvestisseur } from './evaluation-investisseur.vo';
import { CategoriePsfp } from 'src/iam/domain/enums/categorie-psfp.enum';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/iam/domain/domain-services/plafond-psfp.domain-service';

const LIGNE = {
  categoriePsfp: CategoriePsfp.NON_AVERTI,
  patrimoineDeclare: null as number | string | null,
  montantMaxConseille: null as number | string | null,
  niveauRisque: null as string | null,
  dernierContactAdmin: null as Date | null,
  prochainContactDu: null as Date | null,
};

describe('EvaluationInvestisseur.initiale', () => {
  it('classe le nouvel investisseur au plus protecteur', () => {
    const evaluation = EvaluationInvestisseur.initiale();

    expect(evaluation.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(evaluation.estNonAverti()).toBe(true);
    expect(evaluation.estProfessionnel()).toBe(false);
  });

  it("laisse au questionnaire d'adéquation les montants qu'il calcule", () => {
    const evaluation = EvaluationInvestisseur.initiale();

    expect(evaluation.patrimoineDeclare).toBeNull();
    expect(evaluation.montantMaxConseille).toBeNull();
    expect(evaluation.niveauRisque).toBeNull();
    expect(evaluation.prochainContactDu).toBeNull();
  });
});

describe('EvaluationInvestisseur.plafondConseille', () => {
  it('retient 5 % du patrimoine déclaré quand il dépasse le plancher', () => {
    const evaluation = EvaluationInvestisseur.restore({
      ...LIGNE,
      patrimoineDeclare: 500_000,
    });

    expect(evaluation.plafondConseille()).toBe(25_000);
  });

  it('retient le plancher réglementaire pour un patrimoine modeste', () => {
    const evaluation = EvaluationInvestisseur.restore({
      ...LIGNE,
      patrimoineDeclare: 10_000,
    });

    expect(evaluation.plafondConseille()).toBe(PLANCHER_PLAFOND_NON_AVERTI);
  });

  it("retient le plancher tant que rien n'a été déclaré", () => {
    expect(EvaluationInvestisseur.initiale().plafondConseille()).toBe(
      PLANCHER_PLAFOND_NON_AVERTI,
    );
  });

  it('ne conseille aucun plafond hors du statut non averti', () => {
    const professionnel = EvaluationInvestisseur.restore({
      ...LIGNE,
      categoriePsfp: CategoriePsfp.PROFESSIONNEL,
      patrimoineDeclare: 500_000,
    });

    expect(professionnel.plafondConseille()).toBeNull();
    expect(professionnel.estProfessionnel()).toBe(true);
  });
});

describe('EvaluationInvestisseur.restore', () => {
  it('convertit les décimaux que Postgres rend en chaîne', () => {
    expect(
      EvaluationInvestisseur.restore({
        ...LIGNE,
        patrimoineDeclare: '500000.00',
      }).patrimoineDeclare,
    ).toBe(500_000);
  });

  it('traite une valeur illisible comme non renseignée, jamais comme NaN', () => {
    // Un NaN se propagerait jusqu'au calcul du plafond d'investissement.
    const evaluation = EvaluationInvestisseur.restore({
      ...LIGNE,
      patrimoineDeclare: 'illisible',
    });

    expect(evaluation.patrimoineDeclare).toBeNull();
    expect(evaluation.plafondConseille()).toBe(PLANCHER_PLAFOND_NON_AVERTI);
  });
});
