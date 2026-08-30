import { RiskScoringService } from './risk-scoring.service';
import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';
import { QuestionnaireAdequationFactory } from 'src/adequacy/domain/factories/questionnaire-adequation.factory';
import type { SuiviDesInvestisseursQuery } from 'src/adequacy/application/ports/suivi-des-investisseurs.query';
import type { EvaluationDAdequationRepository } from 'src/adequacy/domain/repositories/evaluation-d-adequation.repository';
import { EvaluationDAdequation } from 'src/adequacy/domain/aggregates/evaluation-d-adequation';
import {
  AdequacyAssessment,
  ReponsesQuestionnaire,
} from 'src/adequacy/domain/entities/adequacy-assessment';

const repondre = (reponses: ReponsesQuestionnaire) =>
  QuestionnaireAdequationFactory.repondre(reponses);

function monter(questionnaire: AdequacyAssessment | null) {
  const mocks = {
    // Le service interroge la racine, qui demande son niveau à la pièce qui le
    // calcule — sans la rendre.
    parTitulaire: jest.fn().mockResolvedValue(
      new EvaluationDAdequation({
        investorId: 42,
        adequacy: questionnaire,
      }),
    ),
    // Le suivi est écrit **sur la racine**, puis persisté : c'est donc le
    // profil passé à `save` qu'on inspecte, et non l'argument d'un appel
    // d'écriture ciblée qui n'existe plus.
    save: jest.fn((p: unknown) => Promise.resolve(p)),
    contactsDus: jest.fn().mockResolvedValue([]),
  };

  const service = new RiskScoringService(
    {
      contactsDus: mocks.contactsDus,
    } as unknown as SuiviDesInvestisseursQuery,
    {
      parTitulaire: mocks.parTitulaire,
      save: mocks.save,
    } as unknown as EvaluationDAdequationRepository,
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
    const [enregistre] = mocks.save.mock.calls[0] as [EvaluationDAdequation];
    expect(enregistre.suivi.niveauRisque).toBe(attendu);
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

    const [enregistre] = mocks.save.mock.calls[0] as [EvaluationDAdequation];
    const suivi = enregistre.suivi as { prochainContactDu: Date };
    const attendu = new Date();
    attendu.setMonth(attendu.getMonth() + CADENCE[NiveauRisque.VULNERABLE]);

    expect(suivi.prochainContactDu.getMonth()).toBe(attendu.getMonth());
    expect(suivi.prochainContactDu.getFullYear()).toBe(attendu.getFullYear());
  });
});
