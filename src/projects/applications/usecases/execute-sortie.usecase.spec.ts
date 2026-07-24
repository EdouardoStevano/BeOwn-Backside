import { ExecuteSortieUseCase } from './execute-sortie.usecase';
import { StatutSortie } from '../../domains/sortie-projet';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

describe('ExecuteSortieUseCase — audit role', () => {
  let useCase: ExecuteSortieUseCase;
  let sortieRepo: any;
  let projectRepo: any;
  let investmentRepo: any;
  let auditLog: any;

  const sorteeActee = () => ({
    id: 's1',
    projetId: 'p1',
    prixRevente: 100000,
    dateRevente: new Date(),
    // plusValueBrute = 0 → performanceFee = 0 → on évite de simuler le wallet
    // FRAIS_PLATEFORME, tout en restant sur un cas de sortie « à l'équilibre ».
    plusValueBrute: 0,
    statut: StatutSortie.ACTEE,
  });

  beforeEach(() => {
    sortieRepo = {
      findById: jest.fn().mockResolvedValue(sorteeActee()),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    projectRepo = {
      findProjectById: jest.fn().mockResolvedValue({ capitalCible: 100000 }),
      updateProjectStatus: jest.fn(),
    };
    // Aucun investisseur CONFIRME : suffisant pour atteindre l'appel d'audit
    // sans simuler les mouvements de wallet/ledger par investisseur.
    investmentRepo = { findByProjetId: jest.fn().mockResolvedValue([]) };
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
    // PlatformFeesService mocké : PV brute = 0 dans ces tests → frais 0
    // (parité avec le vrai service qui renvoie 0 sur plus-value ≤ 0).
    const platformFees: any = {
      getRates: jest.fn(),
      computePropertySaleGainFee: jest
        .fn()
        .mockImplementation(async (pv: number) =>
          pv <= 0 ? 0 : Math.round(pv * 15) / 100,
        ),
    };

    useCase = new ExecuteSortieUseCase(
      sortieRepo,
      projectRepo,
      investmentRepo,
      walletRepo,
      txRepo,
      dataSource,
      auditLog,
      amlMonitor,
      platformFees,
    );
  });

  it('audite avec SUPER_ADMIN quand adminRole est omis', async () => {
    await useCase.execute('s1', 7);
    expect(auditLog.create).toHaveBeenCalledWith(
      '7',
      UserRole.SUPER_ADMIN,
      'equity.sortie.execute',
      'sortie_projet',
      's1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it('audite avec le rôle réel de l\'acteur quand adminRole est fourni', async () => {
    await useCase.execute('s1', 7, UserRole.CIO);
    expect(auditLog.create).toHaveBeenCalledWith(
      '7',
      UserRole.CIO,
      'equity.sortie.execute',
      'sortie_projet',
      's1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });
});
