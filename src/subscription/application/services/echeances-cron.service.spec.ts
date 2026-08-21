import { EcheancesCronService } from './echeances-cron.service';
import { EcheanceStatus } from '../../domain/enums/investment-status.enum';

describe('EcheancesCronService', () => {
  let service: EcheancesCronService;
  let echeanceRepo: any;
  let notificationEvents: any;
  let payEcheance: any;
  let notifications: any;

  beforeEach(() => {
    echeanceRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(undefined),
    };
    notificationEvents = {
      echeanceUpcoming: jest.fn().mockResolvedValue(undefined),
      echeanceOverdueAdmin: jest.fn().mockResolvedValue(undefined),
    };
    payEcheance = {
      execute: jest.fn().mockResolvedValue(undefined),
    };
    notifications = {
      pushToAdmins: jest.fn().mockResolvedValue([]),
    };
    service = new EcheancesCronService(
      echeanceRepo,
      notificationEvents,
      payEcheance,
      notifications,
    );
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

  describe('autoPayVerifiedDue', () => {
    it('pays each due verified échéance and counts failures without throwing', async () => {
      echeanceRepo.find.mockResolvedValueOnce([{ id: 'v1' }, { id: 'v2' }]);
      echeanceRepo.count.mockResolvedValueOnce(0);
      payEcheance.execute
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'));

      await service.autoPayVerifiedDue();

      expect(payEcheance.execute).toHaveBeenCalledTimes(2);
      expect(payEcheance.execute).toHaveBeenNthCalledWith(1, 'v1', 0, 'super_admin');
      expect(notifications.pushToAdmins).not.toHaveBeenCalled();
    });

    it('notifies finance of due unverified échéances', async () => {
      echeanceRepo.find.mockResolvedValueOnce([]);
      echeanceRepo.count.mockResolvedValueOnce(3);

      await service.autoPayVerifiedDue();

      expect(notifications.pushToAdmins).toHaveBeenCalledTimes(1);
      expect(notifications.pushToAdmins.mock.calls[0][0].metadata).toEqual({ dueUnverified: 3 });
    });
  });
});
