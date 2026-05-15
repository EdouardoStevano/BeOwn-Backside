import { NotificationEventService } from './notification-event.service';
import { NotificationService } from './notification.service';
import { NotificationType } from '../infrastructure/persistences/entities/notification.entity';

describe('NotificationEventService', () => {
  let service: NotificationEventService;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToRoles: jest.fn().mockResolvedValue([]),
      pushToAdmins: jest.fn().mockResolvedValue([]),
      pushToInvestors: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;
    service = new NotificationEventService(notificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('NotificationEventService.kyc', () => {
  let service: NotificationEventService;
  let notifications: jest.Mocked<NotificationService>;

  beforeEach(() => {
    notifications = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToRoles: jest.fn().mockResolvedValue([]),
      pushToAdmins: jest.fn().mockResolvedValue([]),
      pushToInvestors: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;
    service = new NotificationEventService(notifications);
  });

  it('kycValidatedByAdmin pushes KYC_VALIDE to the user', async () => {
    await service.kycValidatedByAdmin(42, 1);
    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.KYC_VALIDE,
      titre: 'Identité vérifiée ✓',
      message: 'Votre KYC a été validé par notre équipe. Vous pouvez désormais investir.',
      metadata: { adminId: 1 },
    });
  });

  it('kycRejectedByAdmin pushes KYC_REJETE with the motif', async () => {
    await service.kycRejectedByAdmin(42, 'documents illisibles', 1);
    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.KYC_REJETE,
      titre: 'KYC refusé',
      message: 'Votre dossier KYC a été refusé. Motif : documents illisibles. Vous pouvez resoumettre vos documents.',
      metadata: { motif: 'documents illisibles', adminId: 1 },
    });
  });
});
