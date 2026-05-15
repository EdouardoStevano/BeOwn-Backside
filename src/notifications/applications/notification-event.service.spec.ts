import { NotificationEventService } from './notification-event.service';
import { NotificationService } from './notification.service';
import { NotificationType } from '../infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

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

describe('NotificationEventService.accountStatus', () => {
  let service: NotificationEventService;
  let notifications: jest.Mocked<NotificationService>;

  beforeEach(() => {
    notifications = {
      push: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    service = new NotificationEventService(notifications);
  });

  it('accountSuspended with motif', async () => {
    await service.accountSuspended(42, 'multiples tentatives échouées', 1);
    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.COMPTE_SUSPENDU,
      titre: 'Compte suspendu',
      message: "Votre compte a été suspendu par l'équipe BeOwn. Motif : multiples tentatives échouées.",
      metadata: { motif: 'multiples tentatives échouées', adminId: 1 },
    });
  });

  it('accountSuspended without motif', async () => {
    await service.accountSuspended(42, null, 1);
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Votre compte a été suspendu par l'équipe BeOwn.",
        metadata: { motif: null, adminId: 1 },
      }),
    );
  });

  it('accountReactivated', async () => {
    await service.accountReactivated(42, 1);
    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.COMPTE_REACTIVE,
      titre: 'Compte réactivé ✓',
      message: 'Votre compte a été réactivé. Vous pouvez à nouveau accéder à la plateforme.',
      metadata: { adminId: 1 },
    });
  });

  it('accountClosed with motif', async () => {
    await service.accountClosed(42, 'demande RGPD', 1);
    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.COMPTE_CLOS,
      titre: 'Compte clôturé',
      message: "Votre compte a été clôturé par l'équipe BeOwn. Motif : demande RGPD.",
      metadata: { motif: 'demande RGPD', adminId: 1 },
    });
  });
});

describe('NotificationEventService.profileUpdatedByAdmin', () => {
  it('pushes PROFIL_MODIFIE with changed fields list', async () => {
    const notifications = {
      push: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    const service = new NotificationEventService(notifications);

    await service.profileUpdatedByAdmin(42, ['lastname', 'role'], 1);

    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.PROFIL_MODIFIE,
      titre: 'Profil mis à jour',
      message: "Votre profil a été modifié par l'équipe BeOwn (lastname, role).",
      metadata: { changedFields: ['lastname', 'role'], adminId: 1 },
    });
  });
});

describe('NotificationEventService.echeance', () => {
  let service: NotificationEventService;
  let notifications: jest.Mocked<NotificationService>;

  const echeance = {
    id: 'ech-uuid',
    investissementId: 'inv-uuid',
    numero: 3,
    datePrevue: new Date('2026-06-01T00:00:00Z'),
    montantTotal: 50000,
    investissement: { utilisateurId: 42 },
  } as any;
  const project = { id: 'p-uuid', titre: 'Résidence Pelican' } as any;

  beforeEach(() => {
    notifications = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToRoles: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;
    service = new NotificationEventService(notifications);
  });

  it('echeanceUpcoming pushes ECHEANCE to the user', async () => {
    await service.echeanceUpcoming(echeance, project);
    expect(notifications.push).toHaveBeenCalledWith(expect.objectContaining({
      utilisateurId: 42,
      type: NotificationType.ECHEANCE,
      titre: 'Échéance à venir',
      metadata: expect.objectContaining({
        echeanceId: 'ech-uuid',
        projetId: 'p-uuid',
        numero: 3,
        montant: 50000,
      }),
    }));
  });

  it('echeancePaid pushes ECHEANCE confirmed to the user', async () => {
    await service.echeancePaid(echeance, project);
    expect(notifications.push).toHaveBeenCalledWith(expect.objectContaining({
      utilisateurId: 42,
      type: NotificationType.ECHEANCE,
      titre: 'Échéance payée ✓',
    }));
  });

  it('echeanceOverdueAdmin pushes ECHEANCE to ADMIN/FINANCIER', async () => {
    await service.echeanceOverdueAdmin(echeance, project);
    expect(notifications.pushToRoles).toHaveBeenCalledWith(expect.objectContaining({
      type: NotificationType.ECHEANCE,
      titre: 'Échéance en retard',
      roles: [UserRole.ADMIN, UserRole.FINANCIER],
    }));
  });
});
