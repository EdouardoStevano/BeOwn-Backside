import { EcheancesCronService } from './echeances-cron.service';
import { EcheanceStatus } from '../domains/enums/investment-status.enum';

describe('EcheancesCronService', () => {
  let service: EcheancesCronService;
  let echeanceRepo: any;
  let notificationEvents: any;

  beforeEach(() => {
    echeanceRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    notificationEvents = {
      echeanceUpcoming: jest.fn().mockResolvedValue(undefined),
      echeanceOverdueAdmin: jest.fn().mockResolvedValue(undefined),
    };
    service = new EcheancesCronService(echeanceRepo, notificationEvents);
  });

  it('processes J-7 reminders and sets rappelJ7Envoye flag', async () => {
    const e = {
      id: 'e1',
      datePrevue: new Date(),
      statut: EcheanceStatus.A_VENIR,
      rappelJ7Envoye: false,
      investissement: {
        utilisateurId: 42,
        projet: { id: 'p', titre: 'T' },
      },
    };
    echeanceRepo.find.mockResolvedValueOnce([e]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await service.processEcheances();
    expect(notificationEvents.echeanceUpcoming).toHaveBeenCalledWith(e, e.investissement.projet);
    expect(echeanceRepo.update).toHaveBeenCalledWith('e1', { rappelJ7Envoye: true });
  });

  it('processes J-1 reminders and sets rappelJ1Envoye flag', async () => {
    const e = {
      id: 'e2',
      datePrevue: new Date(),
      statut: EcheanceStatus.A_VENIR,
      rappelJ1Envoye: false,
      investissement: {
        utilisateurId: 42,
        projet: { id: 'p', titre: 'T' },
      },
    };
    echeanceRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([e]).mockResolvedValueOnce([]);
    await service.processEcheances();
    expect(notificationEvents.echeanceUpcoming).toHaveBeenCalledWith(e, e.investissement.projet);
    expect(echeanceRepo.update).toHaveBeenCalledWith('e2', { rappelJ1Envoye: true });
  });

  it('marks overdue échéances RETARD and notifies admin', async () => {
    const e = {
      id: 'e3',
      datePrevue: new Date(),
      statut: EcheanceStatus.A_VENIR,
      investissement: {
        utilisateurId: 42,
        projet: { id: 'p', titre: 'T' },
      },
    };
    echeanceRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([e]);
    await service.processEcheances();
    expect(echeanceRepo.update).toHaveBeenCalledWith('e3', { statut: EcheanceStatus.RETARD });
    expect(notificationEvents.echeanceOverdueAdmin).toHaveBeenCalledWith(e, e.investissement.projet);
  });
});
