import { ExecuteDistributionUseCase } from './execute-distribution.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

describe('ExecuteDistributionUseCase — audit role', () => {
  let useCase: ExecuteDistributionUseCase;
  let periodeRepo: any;
  let partRepo: any;
  let investmentRepo: any;
  let auditLog: any;

  const periodeValidee = () => ({
    id: 'per1',
    projetId: 'p1',
    periode: '2026-07',
    statut: StatutPeriodeDistribution.VALIDEE,
    distribueeLe: null,
  });

  beforeEach(() => {
    periodeRepo = {
      findById: jest.fn().mockResolvedValue(periodeValidee()),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    // Aucune part à distribuer : suffisant pour atteindre l'appel d'audit
    // sans avoir à simuler les mouvements de wallet/ledger.
    partRepo = {
      findByPeriode: jest.fn().mockResolvedValue([]),
      markPaid: jest.fn(),
    };
    investmentRepo = { findById: jest.fn() };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };

    const walletRepo: any = {};
    const txRepo: any = {};
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => {
        const em: any = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
        return cb(em);
      }),
    };
    const amlMonitor: any = { check: jest.fn() };

    useCase = new ExecuteDistributionUseCase(
      periodeRepo,
      partRepo,
      investmentRepo,
      walletRepo,
      txRepo,
      dataSource,
      auditLog,
      amlMonitor,
    );
  });

  it('audite avec SUPER_ADMIN quand adminRole est omis', async () => {
    await useCase.execute('per1', 7);
    expect(auditLog.create).toHaveBeenCalledWith(
      '7',
      UserRole.SUPER_ADMIN,
      'equity.distribution.execute',
      'periode_distribution',
      'per1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it('audite avec le rôle réel de l\'acteur quand adminRole est fourni', async () => {
    await useCase.execute('per1', 7, UserRole.CIO);
    expect(auditLog.create).toHaveBeenCalledWith(
      '7',
      UserRole.CIO,
      'equity.distribution.execute',
      'periode_distribution',
      'per1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });
});

describe('ExecuteDistributionUseCase — encaissement des frais plateforme', () => {
  let useCase: ExecuteDistributionUseCase;
  let periodeRepo: any;
  let partRepo: any;
  let investmentRepo: any;
  /** Toutes les entités sauvegardées via em.save (wallets ET transactions) */
  let saved: any[];
  let walletPlat: any;

  const periodeAvecFrais = (overrides: Record<string, unknown> = {}) => ({
    id: 'per1',
    projetId: 'p1',
    periode: '2026-07',
    totalLoyers: 1_000_000,
    statut: StatutPeriodeDistribution.VALIDEE,
    distribueeLe: null,
    fraisPlateformeAnnuel: 833.33,
    fraisGestionLocative: 70_000,
    fraisPlafonnes: false,
    ...overrides,
  });

  beforeEach(() => {
    periodeRepo = {
      findById: jest.fn().mockResolvedValue(periodeAvecFrais()),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    partRepo = {
      findByPeriode: jest.fn().mockResolvedValue([]),
      markPaid: jest.fn(),
    };
    investmentRepo = { findById: jest.fn() };

    walletPlat = null;
    saved = [];
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => {
        const em: any = {
          findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
            if (opts?.where?.type === WalletType.FRAIS_PLATEFORME) {
              return Promise.resolve(walletPlat);
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((_entity, obj) => obj),
          save: jest.fn().mockImplementation((_entity, obj) => {
            const savedObj = { ...obj, id: obj.id ?? 'wallet-plat-1' };
            saved.push(savedObj);
            if (obj?.type === WalletType.FRAIS_PLATEFORME) walletPlat = savedObj;
            return Promise.resolve(savedObj);
          }),
        };
        return cb(em);
      }),
    };

    useCase = new ExecuteDistributionUseCase(
      periodeRepo,
      partRepo,
      investmentRepo,
      {} as any,
      {} as any,
      dataSource,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      { check: jest.fn() } as any,
    );
  });

  const feeTxs = () => saved.filter((s) => typeof s.idempotencyKey === 'string');

  it('écrit les deux transactions de frais depuis les montants STOCKÉS sur la période, à idempotencyKey distribution:fee:<source>:<periodeId>', async () => {
    await useCase.execute('per1');

    const txs = feeTxs();
    expect(txs).toHaveLength(2);
    const plateforme = txs.find((t) => t.metadata?.source === 'plateforme_annuel');
    const gestion = txs.find((t) => t.metadata?.source === 'gestion_locative');

    expect(plateforme).toBeDefined();
    expect(plateforme.montant).toBeCloseTo(833.33, 2);
    expect(plateforme.idempotencyKey).toBe('distribution:fee:plateforme_annuel:per1');

    expect(gestion).toBeDefined();
    expect(gestion.montant).toBeCloseTo(70_000, 2);
    expect(gestion.idempotencyKey).toBe('distribution:fee:gestion_locative:per1');

    // Wallet FRAIS_PLATEFORME crédité du total des deux frais
    expect(walletPlat.solde).toBeCloseTo(70_833.33, 2);
  });

  it('propage fraisPlafonnes en metadata.capped sur les deux transactions', async () => {
    periodeRepo.findById.mockResolvedValue(
      periodeAvecFrais({ fraisPlafonnes: true }),
    );
    await useCase.execute('per1');
    const txs = feeTxs();
    expect(txs.every((t) => t.metadata?.capped === true)).toBe(true);
  });

  it('n\'écrit aucune transaction de frais quand les montants stockés sont à zéro', async () => {
    periodeRepo.findById.mockResolvedValue(
      periodeAvecFrais({ fraisPlateformeAnnuel: 0, fraisGestionLocative: 0 }),
    );
    await useCase.execute('per1');
    expect(feeTxs()).toHaveLength(0);
  });

  it('n\'encaisse rien deux fois : une période DISTRIBUEE ne peut plus être exécutée (garde l\'idempotence des clés de frais)', async () => {
    periodeRepo.findById.mockResolvedValue(
      periodeAvecFrais({ statut: StatutPeriodeDistribution.DISTRIBUEE }),
    );
    await expect(useCase.execute('per1')).rejects.toThrow(/VALIDEE/);
    expect(feeTxs()).toHaveLength(0);
  });
});
