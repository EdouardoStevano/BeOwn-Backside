import { ExecuteDistributionUseCase } from './execute-distribution.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

/**
 * B4 — `markPaid` et `periodeRepo.save` passaient par les dépôts INJECTÉS,
 * donc sur la connexion par défaut, HORS de la transaction de distribution.
 *
 * Une panne au milieu du parcours annulait les crédits mais LAISSAIT les
 * parts déjà traitées marquées payées, et pouvait laisser la période
 * DISTRIBUEE. Le rejeu sautait alors ces parts — investisseurs jamais payés,
 * période close, aucun rattrapage possible : un manquant silencieux.
 *
 * Ces tests éprouvent la PARTICIPATION à la transaction : ce qui compte n'est
 * pas que l'écriture ait lieu, mais qu'elle soit annulable avec le reste.
 */
describe('ExecuteDistributionUseCase — atomicité du marquage', () => {
  const PERIODE_ID = 'per-1';

  const construire = ({ echoueApres = Infinity }: { echoueApres?: number } = {}) => {
    let creditsAppliques = 0;

    /** Ce que la transaction a écrit ; vidé si elle est annulée. */
    const ecrituresTransactionnelles: string[] = [];
    const ecrituresHorsTransaction: string[] = [];

    const em: any = {
      findOne: jest.fn(async () => ({
        id: 'w-1',
        solde: 100_000,
        devise: 'EUR',
      })),
      create: jest.fn((_e: any, o: any) => o),
      save: jest.fn(async (_e: any, o: any) => o),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          update: () => qb,
          set: () => qb,
          setParameter: () => qb,
          where: () => qb,
          execute: async () => {
            creditsAppliques += 1;
            if (creditsAppliques > echoueApres) {
              throw new Error('panne au milieu de la distribution');
            }
            return { affected: 1 };
          },
        };
        return qb;
      }),
      getRepository: jest.fn(() => ({ update: jest.fn(), save: jest.fn() })),
    };

    const parts = [
      {
        id: 'part-1',
        investissementId: 'inv-1',
        montantNet: 100,
        prelevementIR: 0,
        prelevementCSG: 0,
        payeLe: null,
      },
      {
        id: 'part-2',
        investissementId: 'inv-2',
        montantNet: 100,
        prelevementIR: 0,
        prelevementCSG: 0,
        payeLe: null,
      },
    ];

    const periode: any = {
      id: PERIODE_ID,
      projetId: 'proj-1',
      statut: StatutPeriodeDistribution.VALIDEE,
      periode: '2026-06',
    };

    const partRepo: any = {
      findByPeriode: jest.fn(async () => parts),
      markPaid: jest.fn(async (id: string, _date: Date, manager?: unknown) => {
        (manager ? ecrituresTransactionnelles : ecrituresHorsTransaction).push(
          `part:${id}`,
        );
      }),
    };
    const periodeRepo: any = {
      findById: jest.fn(async () => periode),
      save: jest.fn(async (p: any, manager?: unknown) => {
        (manager ? ecrituresTransactionnelles : ecrituresHorsTransaction).push(
          'periode',
        );
        return p;
      }),
    };

    const useCase = new ExecuteDistributionUseCase(
      periodeRepo,
      partRepo,
      {
        findInvestmentById: jest.fn(async (id: string) => ({
          id,
          utilisateurId: Number(String(id).slice(-1)),
          statut: InvestmentStatus.CONFIRME,
        })),
      } as any, // investmentRepo
      {} as any, // walletRepo
      {} as any, // txRepo
      { transaction: jest.fn(async (cb: any) => cb(em)) } as any, // dataSource
      { create: jest.fn() } as any, // auditLog
      { check: jest.fn().mockResolvedValue(undefined) } as any, // amlMonitor
      {
        incrementCounter: jest.fn(),
        setGauge: jest.fn(),
        observeHistogram: jest.fn(),
      } as any, // metrics
      { push: jest.fn(), pushToAdmins: jest.fn() } as any, // notifications
      { findProjectById: jest.fn().mockResolvedValue(null) } as any, // projectRepo
      { distributionRecue: jest.fn().mockResolvedValue(undefined) } as any, // emails
      {
        executeInTransaction: jest
          .fn()
          .mockResolvedValue({ id: 'w-projet', solde: 100_000, devise: 'EUR' }),
      } as any, // projectWalletResolver
      { reinvestirSiOptIn: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return {
      useCase,
      partRepo,
      periodeRepo,
      ecrituresTransactionnelles,
      ecrituresHorsTransaction,
      periode,
    };
  };

  it('marque les parts DANS la transaction, jamais à côté', async () => {
    const h = construire();

    await h.useCase.execute(PERIODE_ID, 1, 'super_admin').catch(() => undefined);

    // Toute écriture de marquage doit avoir reçu le manager : c'est la
    // condition pour qu'un rollback l'emporte avec les crédits.
    expect(h.ecrituresHorsTransaction).toEqual([]);
    expect(h.ecrituresTransactionnelles.length).toBeGreaterThan(0);
  });

  it('bascule la période DANS la transaction', async () => {
    const h = construire();

    await h.useCase.execute(PERIODE_ID, 1, 'super_admin').catch(() => undefined);

    expect(h.periodeRepo.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
    expect(h.ecrituresTransactionnelles).toContain('periode');
  });

  it('panne au milieu : la période ne bascule PAS DISTRIBUEE', async () => {
    const h = construire({ echoueApres: 1 });

    await expect(
      h.useCase.execute(PERIODE_ID, 1, 'super_admin'),
    ).rejects.toThrow('panne au milieu');

    expect(h.ecrituresTransactionnelles).not.toContain('periode');
    expect(h.periodeRepo.save).not.toHaveBeenCalled();
  });

  it('panne au milieu : aucune écriture n’échappe à la transaction annulée', async () => {
    const h = construire({ echoueApres: 1 });

    await expect(
      h.useCase.execute(PERIODE_ID, 1, 'super_admin'),
    ).rejects.toThrow();

    // Le rejeu est possible parce que RIEN n'a été écrit hors transaction :
    // toutes les traces partent avec le rollback.
    expect(h.ecrituresHorsTransaction).toEqual([]);
  });
});
