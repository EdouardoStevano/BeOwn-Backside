import { SaveQuestionnaireUseCase } from './save-questionnaire.usecase';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { ChampProfilInvalideError } from 'src/compliance/domain/errors';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import type { ProfilPPRepository } from 'src/compliance/domain/repositories/profil-pp.repository';
import type { QuestionnaireAdequationRepository } from 'src/compliance/domain/repositories/questionnaire-adequation.repository';
import { QuestionnaireAdequation } from 'src/compliance/domain/aggregates/questionnaire-adequation';
import { SaveQuestionnaireDto } from 'src/compliance/presentation/http/dto/questionnaire.dto';
import type { RiskScoringService } from '../../services/risk-scoring.service';

const DTO_NON_AVERTI = {
  workInFinancialSector: false,
  moreThan10TransactionsPerQuarter: false,
  portfolioOver500k: false,
  previousUnlistedInvestments: false,
  investmentExperienceOver5Years: false,
  financialPatrimonyOver500k: false,
  understandsTotalLossRisk: true,
  financialSectorBackground: false,
  patrimoineNet: 400_000,
  acceptsSimulatedLoss: true,
} as SaveQuestionnaireDto;

const DTO_PROFESSIONNEL = {
  ...DTO_NON_AVERTI,
  workInFinancialSector: true,
  portfolioOver500k: true,
} as SaveQuestionnaireDto;

function monter(existant: QuestionnaireAdequation | null = null) {
  const mocks = {
    findByUserId: jest.fn().mockResolvedValue(existant),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((q: QuestionnaireAdequation) => Promise.resolve(q)),
    enregistrerClassementPsfp: jest.fn().mockResolvedValue(undefined),
    computeAndStore: jest.fn().mockResolvedValue(undefined),
  };

  const useCase = new SaveQuestionnaireUseCase(
    {
      findByUserId: mocks.findByUserId,
      save: mocks.save,
    } as QuestionnaireAdequationRepository,
    {
      enregistrerClassementPsfp: mocks.enregistrerClassementPsfp,
    } as unknown as ProfilPPRepository,
    { computeAndStore: mocks.computeAndStore } as unknown as RiskScoringService,
  );

  return { useCase, mocks };
}

describe('SaveQuestionnaireUseCase', () => {
  it('enregistre un premier passage et son classement', async () => {
    const { useCase, mocks } = monter();

    const questionnaire = await useCase.execute(42, DTO_NON_AVERTI);

    expect(questionnaire.utilisateurId).toBe(42);
    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.montantMaxConseille).toBe(20_000);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("remplace le questionnaire existant plutôt que d'en créer un second", async () => {
    const existant = QuestionnaireAdequationFactory.repondre({
      utilisateurId: 42,
      workInFinancialSector: true,
      portfolioOver500k: true,
    });
    const { useCase, mocks } = monter(existant);

    const questionnaire = await useCase.execute(42, DTO_NON_AVERTI);

    expect(questionnaire).toBe(existant);
    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(mocks.save).toHaveBeenCalledWith(existant);
  });

  it('reporte le classement sur le profil', async () => {
    // `create-investment.usecase` lit ces trois colonnes sur le profil pour
    // opposer le plafond PSFP : le report doit suivre la sauvegarde, sans délai.
    const { useCase, mocks } = monter();

    await useCase.execute(42, DTO_NON_AVERTI);

    expect(mocks.enregistrerClassementPsfp).toHaveBeenCalledWith(42, {
      categoriePsfp: CategoriePsfp.NON_AVERTI,
      patrimoineDeclare: 400_000,
      montantMaxConseille: 20_000,
    });
  });

  it('ne conseille aucun plafond au professionnel', async () => {
    const { useCase, mocks } = monter();

    await useCase.execute(42, DTO_PROFESSIONNEL);

    expect(mocks.enregistrerClassementPsfp).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        categoriePsfp: CategoriePsfp.PROFESSIONNEL,
        montantMaxConseille: null,
      }),
    );
  });

  it('recalcule le niveau de risque du titulaire', async () => {
    const { useCase, mocks } = monter();

    await useCase.execute(42, DTO_NON_AVERTI);

    expect(mocks.computeAndStore).toHaveBeenCalledWith(42);
  });

  it('ne persiste rien quand une réponse est refusée', async () => {
    const { useCase, mocks } = monter();

    await expect(
      useCase.execute(42, { ...DTO_NON_AVERTI, patrimoineNet: -1 }),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.enregistrerClassementPsfp).not.toHaveBeenCalled();
    expect(mocks.computeAndStore).not.toHaveBeenCalled();
  });

  it("n'accepte pas un classement glissé dans le corps de la requête", async () => {
    const { useCase } = monter();

    const questionnaire = await useCase.execute(42, {
      ...DTO_NON_AVERTI,
      resultCategorie: CategoriePsfp.PROFESSIONNEL,
      resultMontantMaxConseille: 10_000_000,
    } as unknown as SaveQuestionnaireDto);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.montantMaxConseille).toBe(20_000);
  });
});
