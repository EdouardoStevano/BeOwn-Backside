import { CategoriePsfp } from './enums/kyc-status.enum';
import { NiveauRisque } from './enums/niveau-risque.enum';
import { ChampProfilInvalideError } from './errors';
import { QuestionnaireAdequationFactory } from './factories/questionnaire-adequation.factory';
import { QuestionnaireAdequationMapper } from './mappers/questionnaire-adequation.mapper';
import { ReponsesQuestionnaire } from './questionnaire-adequation';

const repondre = (reponses: ReponsesQuestionnaire = {}) =>
  QuestionnaireAdequationFactory.repondre({ utilisateurId: 42, ...reponses });

const REPONSES_PROFESSIONNEL: ReponsesQuestionnaire = {
  workInFinancialSector: true,
  portfolioOver500k: true,
};

const REPONSES_AVERTI: ReponsesQuestionnaire = {
  previousUnlistedInvestments: true,
  investmentExperienceOver5Years: true,
  financialPatrimonyOver500k: true,
  understandsTotalLossRisk: true,
};

describe('QuestionnaireAdequationFactory.repondre', () => {
  it('classe le titulaire à partir de ses seules réponses', () => {
    const questionnaire = repondre({
      ...REPONSES_PROFESSIONNEL,
      patrimoineNet: 800_000,
    });

    expect(questionnaire.utilisateurId).toBe(42);
    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.PROFESSIONNEL);
    expect(questionnaire.montantMaxConseille).toBeNull();
  });

  it("n'expose pas le classement au formulaire", () => {
    // Se déclarer « professionnel » dispenserait du délai de rétractation et du
    // plafond d'investissement : la clé est ignorée même si elle atteint la
    // fabrique.
    const questionnaire = repondre({
      resultCategorie: CategoriePsfp.PROFESSIONNEL,
    } as unknown as ReponsesQuestionnaire);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
  });

  it.each([[0], [-1], [1.5]])(
    'refuse un identifiant utilisateur invalide (%p)',
    (utilisateurId) => {
      expect(() =>
        QuestionnaireAdequationFactory.repondre({ utilisateurId }),
      ).toThrow(ChampProfilInvalideError);
    },
  );

  it("laisse la persistance attribuer l'identité de la ligne", () => {
    const questionnaire = repondre();

    expect(questionnaire.id).toBeUndefined();
    expect(questionnaire.createdAt).toBeUndefined();
  });
});

describe('QuestionnaireAdequation.repondre', () => {
  it('remplace les réponses et recalcule le classement', () => {
    const questionnaire = repondre(REPONSES_PROFESSIONNEL);

    questionnaire.repondre({ patrimoineNet: 40_000 });

    // Les critères du premier passage ne survivent pas : un questionnaire se
    // répond d'un bloc.
    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.montantMaxConseille).toBe(2_000);
    expect(questionnaire.preQualification.criteresReunis()).toBe(0);
  });

  it('laisse le questionnaire intact quand une réponse est refusée', () => {
    const questionnaire = repondre(REPONSES_PROFESSIONNEL);

    expect(() =>
      questionnaire.repondre({ ...REPONSES_AVERTI, patrimoineNet: -1 }),
    ).toThrow(ChampProfilInvalideError);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.PROFESSIONNEL);
    expect(questionnaire.preQualification.criteresReunis()).toBe(2);
  });
});

describe('QuestionnaireAdequation.niveauRisque', () => {
  it('suit le professionnel au rythme le plus espacé', () => {
    expect(repondre(REPONSES_PROFESSIONNEL).niveauRisque()).toBe(
      NiveauRisque.QUALIFIE,
    );
  });

  it("suit l'averti à rythme modéré", () => {
    expect(repondre(REPONSES_AVERTI).niveauRisque()).toBe(NiveauRisque.MODERE);
  });

  it('distingue les non-avertis par leur patrimoine', () => {
    expect(repondre({ patrimoineNet: 150_000 }).niveauRisque()).toBe(
      NiveauRisque.MODERE,
    );
    expect(repondre({ patrimoineNet: 20_000 }).niveauRisque()).toBe(
      NiveauRisque.VULNERABLE,
    );
  });

  it('suit de près le titulaire qui ne déclare aucun patrimoine', () => {
    expect(repondre().niveauRisque()).toBe(NiveauRisque.VULNERABLE);
  });
});

describe('QuestionnaireAdequation — sérialisation', () => {
  const LIGNE = {
    id: 'q-1',
    utilisateurId: 42,
    workInFinancialSector: true,
    moreThan10TransactionsPerQuarter: false,
    portfolioOver500k: true,
    previousUnlistedInvestments: false,
    investmentExperienceOver5Years: false,
    financialPatrimonyOver500k: false,
    understandsTotalLossRisk: true,
    financialSectorBackground: false,
    patrimoineNet: 800_000,
    revenuAnnuel: 90_000,
    budgetAnnuelInvestissement: 10_000,
    acceptsSimulatedLoss: true,
    resultCategorie: CategoriePsfp.PROFESSIONNEL,
    resultMontantMaxConseille: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
  };

  it('publie les clés de la table, sans ses blocs internes', () => {
    const questionnaire = QuestionnaireAdequationMapper.restore(LIGNE);

    expect(questionnaire.toJSON()).toEqual(LIGNE);
  });

  it('rend les montants en nombres, y compris relus en chaîne', () => {
    const questionnaire = QuestionnaireAdequationMapper.restore({
      ...LIGNE,
      patrimoineNet: '800000.00',
      resultMontantMaxConseille: '1000.00',
    });

    expect(questionnaire.toJSON().patrimoineNet).toBe(800_000);
    expect(questionnaire.toJSON().resultMontantMaxConseille).toBe(1_000);
  });
});
