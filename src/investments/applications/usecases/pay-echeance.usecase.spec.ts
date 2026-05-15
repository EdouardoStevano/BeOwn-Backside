import { PayEcheanceUseCase } from './pay-echeance.usecase';
import { EcheanceStatus } from '../../domains/enums/investment-status.enum';

describe('PayEcheanceUseCase', () => {
  let useCase: PayEcheanceUseCase;
  let echeanceRepo: any;
  let walletRepo: any;
  let txRepo: any;
  let notificationEvents: any;
  let auditLog: any;

  beforeEach(() => {
    echeanceRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    walletRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((w) => Promise.resolve(w)),
    };
    txRepo = {
      create: jest.fn().mockImplementation((tx) => tx),
      save: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
    };
    notificationEvents = { echeancePaid: jest.fn().mockResolvedValue(undefined) };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    useCase = new PayEcheanceUseCase(echeanceRepo, walletRepo, txRepo, notificationEvents, auditLog);
  });

  it('credits wallet, marks PAYE, notifies user', async () => {
    const project = { id: 'p', titre: 'Résidence' };
    const echeance = {
      id: 'e1',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 50000,
      investissementId: 'i1',
      investissement: {
        utilisateurId: 42,
        projet: project,
        projetId: 'p',
      },
    };
    echeanceRepo.findOne.mockResolvedValue(echeance);
    walletRepo.findOne.mockResolvedValue({ id: 'w1', solde: 100000, devise: 'XOF' });
    await useCase.execute('e1', 1);
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ solde: 150000 }));
    expect(echeanceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: EcheanceStatus.PAYE,
        payeLe: expect.any(Date),
      }),
    );
    expect(notificationEvents.echeancePaid).toHaveBeenCalledWith(echeance, project);
  });

  it('rejects if échéance is already PAYE', async () => {
    echeanceRepo.findOne.mockResolvedValue({ id: 'e1', statut: EcheanceStatus.PAYE });
    await expect(useCase.execute('e1', 1)).rejects.toThrow();
  });
});
