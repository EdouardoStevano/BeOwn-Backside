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

describe('NotificationEventService.retraitProcessed', () => {
  it('pushes RETRAIT_TRAITE to the user with reference', async () => {
    const notifications = {
      push: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    const service = new NotificationEventService(notifications);

    await service.retraitProcessed(42, 100000, 'XOF', 'tx-uuid');

    expect(notifications.push).toHaveBeenCalledWith({
      utilisateurId: 42,
      type: NotificationType.RETRAIT_TRAITE,
      titre: 'Retrait traité ✓',
      message: 'Votre retrait de 100000 XOF a été envoyé vers votre compte bancaire. Référence : tx-uuid.',
      metadata: { montant: 100000, devise: 'XOF', reference: 'tx-uuid' },
    });
  });
});

describe('NotificationEventService.accountDeletedByUser', () => {
  it('pushes COMPTE_SUPPRIME to ADMIN/COMPLIANCE/SUPPORT', async () => {
    const notifications = {
      pushToRoles: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;
    const service = new NotificationEventService(notifications);

    const user = {
      userId: 42,
      firstname: 'Jean',
      lastname: 'Dupont',
      userEmail: { email: 'jean@example.com' },
    } as any;

    await service.accountDeletedByUser(user);

    expect(notifications.pushToRoles).toHaveBeenCalledWith(expect.objectContaining({
      type: NotificationType.COMPTE_SUPPRIME,
      titre: 'Compte supprimé',
      message: 'Jean Dupont (jean@example.com) a supprimé son compte (soft-delete).',
      roles: [UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPPORT],
      metadata: { userId: 42, email: 'jean@example.com' },
    }));
  });
});

describe('NotificationEventService.userRegistered', () => {
  it('pushes NOUVELLE_INSCRIPTION to ADMIN/SUPPORT', async () => {
    const notifications = {
      pushToRoles: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;
    const service = new NotificationEventService(notifications);

    const user = {
      userId: 42,
      firstname: 'Alice',
      lastname: 'Martin',
      userEmail: { email: 'alice@example.com' },
    } as any;

    await service.userRegistered(user);

    expect(notifications.pushToRoles).toHaveBeenCalledWith(expect.objectContaining({
      type: NotificationType.NOUVELLE_INSCRIPTION,
      titre: 'Nouvelle inscription',
      message: "Alice Martin (alice@example.com) vient de s'inscrire sur la plateforme.",
      roles: [UserRole.ADMIN, UserRole.SUPPORT],
      metadata: { userId: 42, email: 'alice@example.com' },
    }));
  });
});

describe('NotificationEventService.secondaryOrderCreated', () => {
  it('pushes MARCHE_SECONDAIRE to ADMIN/COMPLIANCE/FINANCIER', async () => {
    const notifications = {
      pushToRoles: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;
    const service = new NotificationEventService(notifications);

    const ordre = { id: 'o-uuid', nbFractions: 5, prixUnitaire: 1000 } as any;
    const project = { id: 'p-uuid', titre: 'Résidence Pelican' } as any;
    const vendeur = { userId: 42, firstname: 'Jean', lastname: 'Dupont', userEmail: { email: 'j@x.com' } } as any;

    await service.secondaryOrderCreated(ordre, project, vendeur);

    expect(notifications.pushToRoles).toHaveBeenCalledWith(expect.objectContaining({
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: 'Nouvelle annonce marché secondaire',
      message: 'Jean Dupont a mis en vente 5 fraction(s) de "Résidence Pelican" à 1000 XOF/fraction.',
      roles: [UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.FINANCIER],
      metadata: { ordreId: 'o-uuid', projetId: 'p-uuid', vendeurId: 42, nbFractions: 5, prixUnitaire: 1000 },
    }));
  });
});
