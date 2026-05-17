import { PayEcheanceUseCase } from './pay-echeance.usecase';
import { EcheanceStatus } from '../../domains/enums/investment-status.enum';

describe('PayEcheanceUseCase', () => {
  let useCase: PayEcheanceUseCase;
  let echeanceRepo: any;
  let walletRepo: any;
  let txRepo: any;
  let notificationEvents: any;
  let auditLog: any;

  const investorWallet = { id: 'w1', solde: 100000, devise: 'XOF' };
  const walletIR = { id: 'wIR', solde: 0, devise: 'XOF' };
  const walletCSG = { id: 'wCSG', solde: 0, devise: 'XOF' };

  beforeEach(() => {
    echeanceRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    walletRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((w) => w),
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

  it('credits wallet with montantNet (after PFU 30%), stores prelevements, marks PAYE', async () => {
    const project = { id: 'p', titre: 'Résidence' };
    // montantTotal = 50000, montantInterets = 10000
    // IR = 10000 * 0.128 = 1280, CSG = 10000 * 0.172 = 1720, net = 50000 - 1280 - 1720 = 47000
    const echeance = {
      id: 'e1',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 50000,
      montantInterets: 10000,
      investissementId: 'i1',
      investissement: {
        utilisateurId: 42,
        projet: project,
        projetId: 'p',
      },
    };
    echeanceRepo.findOne.mockResolvedValue(echeance);
    // walletRepo.findOne: investor wallet first, then IR (exists), then CSG (exists)
    walletRepo.findOne
      .mockResolvedValueOnce(investorWallet)   // investor wallet
      .mockResolvedValueOnce(walletIR)          // SEQUESTRE_IR already exists
      .mockResolvedValueOnce(walletCSG);        // SEQUESTRE_CSG already exists

    await useCase.execute('e1', 1);

    // Investor credited with net amount (50000 - 1280 - 1720 = 47000)
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ solde: 147000 }));
    // IR séquestre credited with 1280
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'wIR', solde: 1280 }));
    // CSG séquestre credited with 1720
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'wCSG', solde: 1720 }));
    // Échéance fiscal fields stored
    expect(echeanceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: EcheanceStatus.PAYE,
        payeLe: expect.any(Date),
        prelevementIR: 1280,
        prelevementCSG: 1720,
      }),
    );
    expect(notificationEvents.echeancePaid).toHaveBeenCalledWith(echeance, project);
  });

  it('creates séquestre wallets when they do not exist yet', async () => {
    const project = { id: 'p2', titre: 'Test' };
    const echeance = {
      id: 'e2',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 10000,
      montantInterets: 2000,
      investissementId: 'i2',
      investissement: { utilisateurId: 7, projet: project, projetId: 'p2' },
    };
    echeanceRepo.findOne.mockResolvedValue(echeance);
    walletRepo.findOne
      .mockResolvedValueOnce({ id: 'wInv', solde: 0, devise: 'XOF' }) // investor
      .mockResolvedValueOnce(null)  // SEQUESTRE_IR not found → create
      .mockResolvedValueOnce(null); // SEQUESTRE_CSG not found → create
    // walletRepo.save returns the created wallet objects
    walletRepo.save
      .mockResolvedValueOnce({ id: 'wInv', solde: 9744, devise: 'XOF' })      // investor saved
      .mockResolvedValueOnce({ id: 'wIR_new', solde: 0, devise: 'XOF' })       // IR created
      .mockResolvedValueOnce({ id: 'wIR_new', solde: 256, devise: 'XOF' })     // IR credited
      .mockResolvedValueOnce({ id: 'wCSG_new', solde: 0, devise: 'XOF' })      // CSG created
      .mockResolvedValueOnce({ id: 'wCSG_new', solde: 344, devise: 'XOF' });   // CSG credited

    await useCase.execute('e2', 1);

    // walletRepo.create called for both séquestre wallets
    expect(walletRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ fournisseurRef: 'SEQUESTRE-IR' }),
    );
    expect(walletRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ fournisseurRef: 'SEQUESTRE-CSG' }),
    );
  });

  it('rejects if échéance is already PAYE', async () => {
    echeanceRepo.findOne.mockResolvedValue({ id: 'e1', statut: EcheanceStatus.PAYE });
    await expect(useCase.execute('e1', 1)).rejects.toThrow();
  });
});
