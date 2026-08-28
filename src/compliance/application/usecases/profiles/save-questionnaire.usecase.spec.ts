import { SaveQuestionnaireUseCase } from './save-questionnaire.usecase';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { ChampProfilInvalideError } from 'src/compliance/domain/errors';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import type { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { AdequacyAssessment } from 'src/compliance/domain/entities/adequacy-assessment';
import { ProfessionnelPsfp } from 'src/compliance/domain/value-objects/classement-psfp.vo';
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

function monter(existant: AdequacyAssessment | null = null) {
  const mocks = {
    findByInvestorId: jest.fn().mockResolvedValue(
      new InvestorComplianceProfile({
        investorId: 42,
        kycCase: null,
        adequacy: existant,
      }),
    ),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((p: InvestorComplianceProfile) => Promise.resolve(p)),
    computeAndStore: jest.fn().mockResolvedValue(undefined),
  };

  const useCase = new SaveQuestionnaireUseCase(
    {
      findByInvestorId: mocks.findByInvestorId,
      save: mocks.save,
    } as InvestorComplianceProfileRepository,
    { computeAndStore: mocks.computeAndStore } as unknown as RiskScoringService,
  );

  return { useCase, mocks };
}

describe('SaveQuestionnaireUseCase', () => {
  it('enregistre un premier passage et son classement', async () => {
    const { useCase, mocks } = monter();

    const questionnaire = await useCase.execute(42, DTO_NON_AVERTI);

    expect(questionnaire.resultCategorie).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.resultMontantMaxConseille).toBe(20_000);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("remplace le questionnaire existant plutôt que d'en créer un second", async () => {
    const existant = QuestionnaireAdequationFactory.repondre({
      workInFinancialSector: true,
      portfolioOver500k: true,
    });
    const { useCase, mocks } = monter(existant);

    const questionnaire = await useCase.execute(42, DTO_NON_AVERTI);

    // La réponse publie l'instantané du questionnaire, pas l'entité : c'est
    // son contenu qui doit correspondre, et non son identité en mémoire.
    expect(questionnaire).toEqual(existant.toJSON());
    expect(questionnaire.resultCategorie).toBe(CategoriePsfp.NON_AVERTI);
    // La racine est enregistrée d'un bloc, en portant le questionnaire relu et
    // non un second exemplaire.
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0].pieces.adequacy).toBe(existant);
  });

  it('rend le classement opposable dès la sauvegarde', async () => {
    // Il n'est plus reporté nulle part : la racine le porte, et
    // `PROFIL_CONFORMITE_QUERY` le sert à `subscription`. Ce qui se vérifie
    // ici, c'est donc ce que la racine enregistrée impose.
    const { useCase, mocks } = monter();

    await useCase.execute(42, DTO_NON_AVERTI);

    const [enregistre] = mocks.save.mock.calls[0] as [
      InvestorComplianceProfile,
    ];
    expect(enregistre.classement.toSnapshot()).toEqual({
      categoriePsfp: CategoriePsfp.NON_AVERTI,
      patrimoineDeclare: 400_000,
      montantMaxConseille: 20_000,
    });
  });

  it('ne conseille aucun plafond au professionnel', async () => {
    const { useCase, mocks } = monter();

    await useCase.execute(42, DTO_PROFESSIONNEL);

    const [enregistre] = mocks.save.mock.calls[0] as [
      InvestorComplianceProfile,
    ];
    // Le montant n'est pas « à null » : la classe du professionnel ne le porte
    // pas du tout, et `toSnapshot` ne le replie en `null` que pour la table.
    expect(enregistre.classement).toBeInstanceOf(ProfessionnelPsfp);
    expect(enregistre.classement.toSnapshot()).toMatchObject({
      categoriePsfp: CategoriePsfp.PROFESSIONNEL,
      montantMaxConseille: null,
    });
    expect(enregistre.plafondConseille()).toBeNull();
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
    expect(mocks.computeAndStore).not.toHaveBeenCalled();
  });

  it("n'accepte pas un classement glissé dans le corps de la requête", async () => {
    const { useCase } = monter();

    const questionnaire = await useCase.execute(42, {
      ...DTO_NON_AVERTI,
      resultCategorie: CategoriePsfp.PROFESSIONNEL,
      resultMontantMaxConseille: 10_000_000,
    } as unknown as SaveQuestionnaireDto);

    expect(questionnaire.resultCategorie).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.resultMontantMaxConseille).toBe(20_000);
  });
});
