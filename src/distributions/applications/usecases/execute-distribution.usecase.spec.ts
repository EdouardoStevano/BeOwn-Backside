import { ExecuteDistributionUseCase } from './execute-distribution.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

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
    investmentRepo = { findInvestmentById: jest.fn() };
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
