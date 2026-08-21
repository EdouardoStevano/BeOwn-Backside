import { RiskScoringService } from './risk-scoring.service';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import type { ProfilPPRepository } from 'src/compliance/domain/repositories/profil-pp.repository';
import type { QuestionnaireAdequationRepository } from 'src/compliance/domain/repositories/questionnaire-adequation.repository';
import {
  AdequacyAssessment,
  ReponsesQuestionnaire,
} from 'src/compliance/domain/entities/adequacy-assessment';

const repondre = (reponses: ReponsesQuestionnaire) =>
  QuestionnaireAdequationFactory.repondre({ utilisateurId: 42, ...reponses });

function monter(questionnaire: AdequacyAssessment | null) {
  const mocks = {
    findByUserId: jest.fn().mockResolvedValue(questionnaire),
    enregistrerSuiviRisque: jest.fn().mockResolvedValue(undefined),
    listerContactsDus: jest.fn().mockResolvedValue([]),
  };

  const service = new RiskScoringService(
    {
      enregistrerSuiviRisque: mocks.enregistrerSuiviRisque,
      listerContactsDus: mocks.listerContactsDus,
    } as unknown as ProfilPPRepository,
    {
      findByUserId: mocks.findByUserId,
    } as unknown as QuestionnaireAdequationRepository,
  );

  return { service, mocks };
}

/** Mois attendus entre deux contacts, par niveau — cf. `prochainContactApres`. */
const CADENCE = {
  [NiveauRisque.VULNERABLE]: 3,
  [NiveauRisque.MODERE]: 6,
  [NiveauRisque.QUALIFIE]: 12,
};

describe('RiskScoringService.computeAndStore', () => {
  it.each([
    [
      NiveauRisque.QUALIFIE,
      { workInFinancialSector: true, portfolioOver500k: true },
    ],
    [
      NiveauRisque.MODERE,
      {
        previousUnlistedInvestments: true,
        investmentExperienceOver5Years: true,
        financialPatrimonyOver500k: true,
        understandsTotalLossRisk: true,
      },
    ],
    [NiveauRisque.VULNERABLE, { patrimoineNet: 10_000 }],
  ])('déduit le niveau %s des réponses', async (attendu, reponses) => {
    const { service, mocks } = monter(repondre(reponses));

    await expect(service.computeAndStore(42)).resolves.toBe(attendu);
    expect(mocks.enregistrerSuiviRisque).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ niveauRisque: attendu }),
    );
  });

  it('traite comme vulnérable le titulaire sans questionnaire', async () => {
    // Le suivi le plus rapproché : se tromper dans ce sens ne coûte qu'un
    // contact de trop.
    const { service } = monter(null);

    await expect(service.computeAndStore(42)).resolves.toBe(
      NiveauRisque.VULNERABLE,
    );
  });

  it('programme le prochain contact selon la cadence du niveau', async () => {
    const { service, mocks } = monter(repondre({ patrimoineNet: 10_000 }));

    await service.computeAndStore(42);

    const [, suivi] = mocks.enregistrerSuiviRisque.mock.calls[0] as [
      number,
      { prochainContactDu: Date },
    ];
    const attendu = new Date();
    attendu.setMonth(attendu.getMonth() + CADENCE[NiveauRisque.VULNERABLE]);

    expect(suivi.prochainContactDu.getMonth()).toBe(attendu.getMonth());
    expect(suivi.prochainContactDu.getFullYear()).toBe(attendu.getFullYear());
  });
});
