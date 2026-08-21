import { BadRequestException } from '@nestjs/common';
import { SaveTestConnaissancesUseCase } from './save-test-connaissances.usecase';
import { SaveQuestionnaireUseCase } from './save-questionnaire.usecase';
import { DomaineTestConnaissances } from '../../domains/knowledge-test';

/**
 * Persistance du test de connaissances — art. 21(1) à 21(4) du règlement
 * (UE) 2020/1503.
 *
 * Le domaine de calcul et la colonne `testConnaissancesAdequat` existaient,
 * mais AUCUNE route ne les écrivait : la valeur restait `null` pour tout le
 * monde et l'avertissement d'inadéquation ne pouvait jamais se déclencher.
 */
describe('SaveTestConnaissancesUseCase', () => {
  const USER_ID = 42;
  let row: any;
  let repo: any;
  let usecase: SaveTestConnaissancesUseCase;

  beforeEach(() => {
    row = null;
    repo = {
      findOne: jest.fn(async () => row),
      create: jest.fn((seed: any) => ({ ...seed })),
      save: jest.fn(async (entity: any) => {
        row = entity;
        return entity;
      }),
    };
    usecase = new SaveTestConnaissancesUseCase(repo);
  });

  it('score adéquat : persiste adequat=true, aucun avertissement dû', async () => {
    const res = await usecase.execute(USER_ID, { score: 8, total: 10 } as any);

    expect(res).toEqual(
      expect.objectContaining({
        score: 8,
        total: 10,
        ratio: 0.8,
        adequat: true,
        avertissementRequis: false,
        avertissement: null,
      }),
    );
    expect(row.testConnaissancesScore).toBe(8);
    expect(row.testConnaissancesTotal).toBe(10);
    expect(row.testConnaissancesAdequat).toBe(true);
  });

  it('score inadéquat : persiste adequat=false et renvoie l\'avertissement art. 21(4)', async () => {
    const res: any = await usecase.execute(USER_ID, { score: 4, total: 10 } as any);

    expect(res.adequat).toBe(false);
    expect(res.avertissementRequis).toBe(true);
    // Le texte réglementaire vient du serveur : le front n'a pas à le recopier.
    expect(res.avertissement).toMatch(/perdre la totalité des sommes investies/);
    expect(row.testConnaissancesAdequat).toBe(false);
  });

  it('le seuil de 70 % est inclusif', async () => {
    const res: any = await usecase.execute(USER_ID, { score: 7, total: 10 } as any);
    expect(res.adequat).toBe(true);
  });

  it('un échec n\'interdit pas d\'investir : aucun blocage n\'est levé', async () => {
    // Art. 21(4) — le use case doit renvoyer un résultat, jamais lever.
    await expect(
      usecase.execute(USER_ID, { score: 0, total: 10 } as any),
    ).resolves.toEqual(expect.objectContaining({ adequat: false }));
  });

  it('crée la ligne de questionnaire si le test précède l\'évaluation patrimoniale', async () => {
    await usecase.execute(USER_ID, { score: 9, total: 10 } as any);

    expect(repo.create).toHaveBeenCalledWith({ utilisateurId: USER_ID });
    expect(row.utilisateurId).toBe(USER_ID);
  });

  it('signale les domaines du règlement délégué non couverts', async () => {
    const res: any = await usecase.execute(USER_ID, {
      score: 9,
      total: 10,
      domainesCouverts: [
        DomaineTestConnaissances.RISQUES,
        DomaineTestConnaissances.TYPES_INVESTISSEMENTS,
      ],
    } as any);

    expect(res.domainesManquants).toEqual(
      expect.arrayContaining([
        DomaineTestConnaissances.EXPERIENCE_ANTERIEURE,
        DomaineTestConnaissances.OBJECTIFS_INVESTISSEMENT,
        DomaineTestConnaissances.SITUATION_FINANCIERE,
        DomaineTestConnaissances.COMPREHENSION_RISQUE_PERTE,
      ]),
    );
  });

  // ─── Re-soumission ─────────────────────────────────────────────────────────

  it('re-soumission : le nouveau résultat écrase l\'ancien', async () => {
    await usecase.execute(USER_ID, { score: 3, total: 10 } as any);
    expect(row.testConnaissancesAdequat).toBe(false);

    const res: any = await usecase.execute(USER_ID, { score: 9, total: 10 } as any);

    expect(res.adequat).toBe(true);
    expect(row.testConnaissancesScore).toBe(9);
    expect(row.testConnaissancesAdequat).toBe(true);
    // La ligne existante est réutilisée : pas de doublon par utilisateur.
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('re-soumission : l\'accusé de réception précédent ne vaut pas pour le nouveau résultat', async () => {
    await usecase.execute(USER_ID, {
      score: 3,
      total: 10,
      avertissementInadequationAccepte: true,
    } as any);
    expect(row.avertissementInadequationAccepte).toBe(true);

    // Nouveau test toujours insuffisant, sans nouvel accusé de réception.
    await usecase.execute(USER_ID, { score: 4, total: 10 } as any);

    expect(row.testConnaissancesAdequat).toBe(false);
    expect(row.avertissementInadequationAccepte).toBe(false);
  });

  // ─── Erreurs ───────────────────────────────────────────────────────────────

  it.each([
    ['score supérieur au total', { score: 12, total: 10 }],
    ['total nul', { score: 0, total: 0 }],
  ])('%s : 400, pas un 500', async (_label, dto) => {
    await expect(usecase.execute(USER_ID, dto as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});

/**
 * Soumission COMBINÉE : le front n'effectue qu'un appel
 * (`POST /profiles/questionnaire`). Les champs du test y sont optionnels — le
 * payload historique doit continuer de fonctionner à l'identique.
 */
describe('SaveQuestionnaireUseCase — test de connaissances joint', () => {
  const USER_ID = 7;
  let row: any;
  let questionnaireRepo: any;
  let profilPPRepo: any;
  let usecase: SaveQuestionnaireUseCase;

  const basePayload = {
    experienceProfessionnelleFinanciere: false,
    revenuAnnuel: 30000,
    actifsTotaux: 50000,
    engagementsFinanciers: 10000,
    simulationPerteAcceptee: true,
  };

  beforeEach(() => {
    row = null;
    questionnaireRepo = {
      findOne: jest.fn(async () => row),
      create: jest.fn((seed: any) => ({ ...seed })),
      save: jest.fn(async (entity: any) => {
        row = entity;
        return entity;
      }),
    };
    profilPPRepo = { update: jest.fn().mockResolvedValue(undefined) };
    usecase = new SaveQuestionnaireUseCase(questionnaireRepo, profilPPRepo, {
      computeAndStore: jest.fn().mockResolvedValue(undefined),
    } as any);
  });

  it('payload historique (sans test) : les champs du test restent intouchés', async () => {
    await usecase.execute(USER_ID, { ...basePayload } as any);

    expect(row.testConnaissancesScore).toBeUndefined();
    expect(row.testConnaissancesAdequat).toBeUndefined();
    // L'évaluation patrimoniale, elle, est bien calculée.
    expect(row.resultCategorie).toBe('non_averti');
  });

  it('score joint : évalue et persiste l\'adéquation en un seul appel', async () => {
    await usecase.execute(USER_ID, {
      ...basePayload,
      testConnaissancesScore: 9,
      testConnaissancesTotal: 10,
    } as any);

    expect(row.testConnaissancesAdequat).toBe(true);
    expect(row.testConnaissancesScore).toBe(9);
    // Un seul écrit : pas de course entre les deux chemins de soumission.
    expect(questionnaireRepo.save).toHaveBeenCalledTimes(1);
  });

  it('score joint insuffisant : adequat=false, l\'avertissement devient dû', async () => {
    await usecase.execute(USER_ID, {
      ...basePayload,
      testConnaissancesScore: 2,
      testConnaissancesTotal: 10,
    } as any);

    expect(row.testConnaissancesAdequat).toBe(false);
    expect(row.avertissementInadequationAccepte).toBe(false);
  });

  it('accusé de réception seul : acquitte sans repasser le test', async () => {
    await usecase.execute(USER_ID, {
      ...basePayload,
      avertissementInadequationAccepte: true,
    } as any);

    expect(row.avertissementInadequationAccepte).toBe(true);
    expect(row.testConnaissancesScore).toBeUndefined();
  });

  it.each([
    ['score sans total', { testConnaissancesScore: 8 }],
    ['total sans score', { testConnaissancesTotal: 10 }],
  ])('%s : 400 explicite, aucune écriture', async (_label, partial) => {
    await expect(
      usecase.execute(USER_ID, { ...basePayload, ...partial } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(questionnaireRepo.save).not.toHaveBeenCalled();
  });
});
