import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminController } from './admin.controller';
import {
  UserStatus,
  UserRole,
} from 'src/iam/domains/enums/user.enum';

/**
 * PATCH /admin/users/:id/status — suspendre / réactiver / clôturer un compte.
 *
 * Deux trous constatés le 09/08/2026, l'endpoint ne consultant jamais le statut
 * courant :
 *
 * 1. Un compte SUPPRIME pouvait être remis ACTIF ou SUSPENDU — une résurrection
 *    de compte supprimé. SUPPRIME est un état terminal : la seule sortie
 *    légitime passerait par une décision explicite hors de cet endpoint.
 * 2. Le DTO accepte tout `UserStatus` (@IsEnum), donc SUPPRIME pouvait être posé
 *    directement ici, court-circuitant DeleteAccountUseCase — donc les bloqueurs
 *    (investissements actifs, ordres ouverts), le retrait automatique du solde et
 *    les notifications de suppression. La suppression doit rester le seul fait de
 *    DELETE /admin/users/:id.
 */
describe('AdminController — PATCH /admin/users/:id/status', () => {
  let controller: AdminController;
  let userRepo: any;
  let notificationEvents: any;

  const admin = { userId: 1, role: UserRole.SUPER_ADMIN } as any;

  /** assertUserManage lit l'acteur courant, puis le handler lit la cible. */
  const mockLookups = (target: any, roleActeur = UserRole.SUPER_ADMIN) => {
    userRepo.findOne
      .mockResolvedValueOnce({ userId: 1, role: roleActeur })
      .mockResolvedValueOnce(target);
  };

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    notificationEvents = {
      accountSuspended: jest.fn(),
      accountReactivated: jest.fn(),
      accountClosed: jest.fn(),
    };

    controller = new AdminController(
      userRepo,
      /* projectRepo */ {} as any,
      /* investRepo */ {} as any,
      /* kycRepo */ {} as any,
      /* ordreRepo */ {} as any,
      notificationEvents,
      /* deleteAccountUseCase */ { execute: jest.fn() } as any,
    );
  });

  describe('un compte supprimé est un état terminal', () => {
    it('refuse (409) de le réactiver', async () => {
      mockLookups({ userId: 42, status: UserStatus.SUPPRIME });

      await expect(
        controller.updateUserStatus(42, { status: UserStatus.ACTIF } as any, admin),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(userRepo.update).not.toHaveBeenCalled();
      expect(notificationEvents.accountReactivated).not.toHaveBeenCalled();
    });

    it('refuse (409) de le suspendre', async () => {
      mockLookups({ userId: 42, status: UserStatus.SUPPRIME });

      await expect(
        controller.updateUserStatus(42, { status: UserStatus.SUSPENDU } as any, admin),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(userRepo.update).not.toHaveBeenCalled();
      expect(notificationEvents.accountSuspended).not.toHaveBeenCalled();
    });
  });

  describe('la suppression ne passe pas par cet endpoint', () => {
    it('refuse (409) de poser SUPPRIME, qui court-circuiterait DeleteAccountUseCase', async () => {
      mockLookups({ userId: 42, status: UserStatus.ACTIF });

      await expect(
        controller.updateUserStatus(42, { status: UserStatus.SUPPRIME } as any, admin),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('transitions légitimes — comportement inchangé', () => {
    it('suspend un compte actif et notifie', async () => {
      mockLookups({ userId: 42, status: UserStatus.ACTIF });

      const res = await controller.updateUserStatus(
        42,
        { status: UserStatus.SUSPENDU, motif: 'Fraude' } as any,
        admin,
      );

      expect(userRepo.update).toHaveBeenCalledWith(
        { userId: 42 },
        { status: UserStatus.SUSPENDU },
      );
      expect(notificationEvents.accountSuspended).toHaveBeenCalledWith(42, 'Fraude', 1);
      expect(res).toEqual({ userId: 42, status: UserStatus.SUSPENDU });
    });

    it('réactive un compte suspendu et notifie', async () => {
      mockLookups({ userId: 42, status: UserStatus.SUSPENDU });

      await controller.updateUserStatus(42, { status: UserStatus.ACTIF } as any, admin);

      expect(notificationEvents.accountReactivated).toHaveBeenCalledWith(42, 1);
    });

    it('clôture un compte actif et notifie', async () => {
      mockLookups({ userId: 42, status: UserStatus.ACTIF });

      await controller.updateUserStatus(
        42,
        { status: UserStatus.CLOS, motif: 'Demande client' } as any,
        admin,
      );

      expect(notificationEvents.accountClosed).toHaveBeenCalledWith(42, 'Demande client', 1);
    });
  });

  it('404 si la cible est introuvable', async () => {
    mockLookups(null);

    await expect(
      controller.updateUserStatus(999, { status: UserStatus.SUSPENDU } as any, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * Un rôle de back-office ne se sanctionne pas depuis l'écran de modération.
   * `compliance` détient `users:manage` : sans cette garde, il pouvait
   * suspendre le super_admin, le rcci qui l'audite ou l'équipe financière —
   * neutraliser un contrôle interne était à la portée d'un rôle de contrôle.
   */
  describe('un compte de back-office ne se suspend que par un super_admin', () => {
    const compliance = { userId: 2, role: UserRole.COMPLIANCE } as any;

    it.each([
      UserRole.SUPER_ADMIN,
      UserRole.RCCI,
      UserRole.CIO,
      UserRole.DPO,
      UserRole.SUPPORT,
    ])('compliance ne peut pas suspendre un %s', async (roleCible) => {
      mockLookups(
        { userId: 42, status: UserStatus.ACTIF, role: roleCible },
        UserRole.COMPLIANCE,
      );

      await expect(
        controller.updateUserStatus(
          42,
          { status: UserStatus.SUSPENDU } as any,
          compliance,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(userRepo.update).not.toHaveBeenCalled();
      expect(notificationEvents.accountSuspended).not.toHaveBeenCalled();
    });

    it('compliance suspend toujours un investisseur (cas nominal préservé)', async () => {
      mockLookups(
        { userId: 42, status: UserStatus.ACTIF, role: UserRole.INVESTISSEUR },
        UserRole.COMPLIANCE,
      );

      await controller.updateUserStatus(
        42,
        { status: UserStatus.SUSPENDU } as any,
        compliance,
      );

      expect(userRepo.update).toHaveBeenCalled();
    });

    it('super_admin conserve la main sur un compte de back-office', async () => {
      mockLookups({
        userId: 42,
        status: UserStatus.ACTIF,
        role: UserRole.SUPPORT,
      });

      await controller.updateUserStatus(
        42,
        { status: UserStatus.SUSPENDU } as any,
        admin,
      );

      expect(userRepo.update).toHaveBeenCalled();
    });
  });

  /**
   * Le contrôle en base visait `reports:read` — une permission de LECTURE —
   * alors que la route exige `users:manage`. Les deux visent enfin la même.
   */
  it('refuse un rôle qui lit les rapports mais ne gère pas les utilisateurs', async () => {
    mockLookups(
      { userId: 42, status: UserStatus.ACTIF, role: UserRole.INVESTISSEUR },
      UserRole.CIO,
    );

    await expect(
      controller.updateUserStatus(
        42,
        { status: UserStatus.SUSPENDU } as any,
        { userId: 3, role: UserRole.CIO } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
