import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminInvestorsController } from './admin-investors.controller';
import { UserRole } from 'src/iam/domains/enums/user.enum';

describe('AdminInvestorsController.changeRole', () => {
  const admin = { userId: 1, role: UserRole.SUPER_ADMIN } as any;
  const riskScoring = {} as any;

  const makeUserRepo = (usersById: Record<number, any>, remainingSuperAdmins = 1) => ({
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(usersById[where.userId] ?? null),
    ),
    count: jest.fn().mockResolvedValue(remainingSuperAdmins),
    save: jest.fn().mockImplementation((u: any) => Promise.resolve(u)),
  });

  const makeSessionCache = () => ({
    invalidateRefreshTokenId: jest.fn().mockResolvedValue(undefined),
  });

  const makeAuditLog = () => ({ create: jest.fn().mockResolvedValue({}) });

  /** Assemble le contrôleur avec ses quatre dépendances mockées. */
  const makeController = (
    userRepo: ReturnType<typeof makeUserRepo>,
    sessionCache = makeSessionCache(),
    auditLog = makeAuditLog(),
  ) => ({
    controller: new AdminInvestorsController(
      userRepo as any,
      riskScoring,
      sessionCache as any,
      auditLog as any,
    ),
    sessionCache,
    auditLog,
  });

  it('refuse un rôle inconnu (BadRequest)', async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
    });
    const { controller } = makeController(userRepo);

    await expect(
      controller.changeRole(5, { role: 'not-a-real-role' }, admin),
    ).rejects.toThrow(BadRequestException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("refuse si l'utilisateur cible est introuvable (NotFound)", async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
    });
    const { controller } = makeController(userRepo);

    await expect(
      controller.changeRole(5, { role: UserRole.CGP }, admin),
    ).rejects.toThrow(NotFoundException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('cas nominal : sauvegarde et renvoie {userId, role}', async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
      5: { userId: 5, role: UserRole.INVESTISSEUR },
    });
    const { controller } = makeController(userRepo);

    const result = await controller.changeRole(5, { role: UserRole.CGP }, admin);

    expect(result).toMatchObject({ userId: 5, role: UserRole.CGP });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, role: UserRole.CGP }),
    );
  });

  it('refuse de modifier son propre rôle (BadRequest)', async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
    });
    const { controller } = makeController(userRepo);

    await expect(
      controller.changeRole(1, { role: UserRole.CIO }, admin),
    ).rejects.toThrow(BadRequestException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('refuse de rétrograder le dernier super_admin (BadRequest)', async () => {
    const userRepo = makeUserRepo(
      {
        1: { userId: 1, role: UserRole.SUPER_ADMIN },
        2: { userId: 2, role: UserRole.SUPER_ADMIN },
      },
      1,
    );
    const { controller } = makeController(userRepo);

    await expect(
      controller.changeRole(2, { role: UserRole.CIO }, admin),
    ).rejects.toThrow(BadRequestException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('autorise la rétrogradation si 2+ super_admins existent', async () => {
    const userRepo = makeUserRepo(
      {
        1: { userId: 1, role: UserRole.SUPER_ADMIN },
        2: { userId: 2, role: UserRole.SUPER_ADMIN },
      },
      2,
    );
    const { controller } = makeController(userRepo);

    const result = await controller.changeRole(2, { role: UserRole.CIO }, admin);

    expect(result).toMatchObject({ userId: 2, role: UserRole.CIO });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, role: UserRole.CIO }),
    );
  });

  /**
   * Le rôle vit dans le JWT : sans révocation de la rotation, la cible garde
   * ses anciens droits — indéfiniment avant le correctif de `TokenService`,
   * et jusqu'à l'expiration de l'access token après.
   */
  describe('invalidation de la session ciblée', () => {
    const cible = {
      userId: 5,
      role: UserRole.SUPER_ADMIN,
      userEmail: { email: 'cible@example.com' },
    };

    it('révoque le refresh token de la cible après le changement', async () => {
      const userRepo = makeUserRepo(
        { 1: { userId: 1, role: UserRole.SUPER_ADMIN }, 5: { ...cible } },
        2,
      );
      const { controller, sessionCache } = makeController(userRepo);

      const result = await controller.changeRole(
        5,
        { role: UserRole.INVESTISSEUR },
        admin,
      );

      expect(sessionCache.invalidateRefreshTokenId).toHaveBeenCalledWith(
        'cible@example.com',
      );
      expect(result).toMatchObject({ sessionInvalidee: true });
    });

    it("n'invalide rien si le compte n'a pas d'adresse (clé de session absente)", async () => {
      const userRepo = makeUserRepo({
        1: { userId: 1, role: UserRole.SUPER_ADMIN },
        5: { userId: 5, role: UserRole.INVESTISSEUR },
      });
      const { controller, sessionCache } = makeController(userRepo);

      const result = await controller.changeRole(5, { role: UserRole.CGP }, admin);

      expect(sessionCache.invalidateRefreshTokenId).not.toHaveBeenCalled();
      // Signalé au back-office plutôt que passé sous silence.
      expect(result).toMatchObject({ sessionInvalidee: false });
    });

    it('ne révoque rien quand le changement est refusé', async () => {
      const userRepo = makeUserRepo({
        1: { userId: 1, role: UserRole.SUPER_ADMIN },
      });
      const { controller, sessionCache } = makeController(userRepo);

      await expect(
        controller.changeRole(5, { role: UserRole.CGP }, admin),
      ).rejects.toThrow(NotFoundException);
      expect(sessionCache.invalidateRefreshTokenId).not.toHaveBeenCalled();
    });
  });

  describe('journal d’audit', () => {
    it("trace l'ancien et le nouveau rôle (une rétrogradation doit se relire)", async () => {
      const userRepo = makeUserRepo(
        {
          1: { userId: 1, role: UserRole.SUPER_ADMIN },
          5: {
            userId: 5,
            role: UserRole.SUPER_ADMIN,
            userEmail: { email: 'cible@example.com' },
          },
        },
        2,
      );
      const { controller, auditLog } = makeController(userRepo);

      await controller.changeRole(5, { role: UserRole.INVESTISSEUR }, admin);

      expect(auditLog.create).toHaveBeenCalledWith(
        '1',
        UserRole.SUPER_ADMIN,
        'user.role.change',
        'users',
        '5',
        undefined,
        undefined,
        {
          ancienRole: UserRole.SUPER_ADMIN,
          nouveauRole: UserRole.INVESTISSEUR,
          sessionInvalidee: true,
        },
      );
    });

    it("n'écrit aucune entrée quand le changement est refusé", async () => {
      const userRepo = makeUserRepo({
        1: { userId: 1, role: UserRole.SUPER_ADMIN },
      });
      const { controller, auditLog } = makeController(userRepo);

      await expect(
        controller.changeRole(1, { role: UserRole.CIO }, admin),
      ).rejects.toThrow(BadRequestException);
      expect(auditLog.create).not.toHaveBeenCalled();
    });
  });
});
