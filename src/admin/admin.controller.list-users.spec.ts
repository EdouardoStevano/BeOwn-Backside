import { ForbiddenException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Lot 2-back — minimisation RGPD de `GET /admin/users`.
 *
 * L'annuaire complet (identités + e-mails + montants investis) était servi à
 * tout rôle détenant `reports:read`. Deux niveaux désormais :
 *  - `users:read`  → projection complète, inchangée (page « Utilisateurs ») ;
 *  - `aml:manage` seul (rcci, via le sélecteur PEP) → projection restreinte,
 *    sans e-mail ni donnée financière, et recherche par nom uniquement.
 */
describe('AdminController.listUsers — projection selon la permission', () => {
  const buildUser = (userId: number, over: Partial<any> = {}) => ({
    userId,
    firstname: 'Jean',
    lastname: `Dupont${userId}`,
    role: UserRole.INVESTISSEUR,
    status: 'actif',
    password: 'hash-ne-doit-jamais-sortir',
    regimeFiscal: 'pfu',
    tauxBaremeMarginal: 0.3,
    stripeConnectAccountId: 'acct_secret',
    pepFlagged: false,
    pepNote: 'note interne',
    userEmail: { email: `jean${userId}@exemple.fr` },
    createdAt: new Date('2026-01-01'),
    ...over,
  });

  const makeController = (callerRole: UserRole, users = [buildUser(1), buildUser(2)]) => {
    const userRepo: any = {
      // 1er appel : résolution du rôle de l'appelant (défense en profondeur).
      findOne: jest.fn().mockResolvedValue({ userId: 99, role: callerRole }),
      findAndCount: jest.fn().mockResolvedValue([users, users.length]),
    };
    const investQB: any = {
      select: jest.fn(() => investQB),
      addSelect: jest.fn(() => investQB),
      where: jest.fn(() => investQB),
      andWhere: jest.fn(() => investQB),
      groupBy: jest.fn(() => investQB),
      getRawMany: jest.fn().mockResolvedValue([{ userId: 1, total: '5000' }]),
    };
    const investRepo: any = { createQueryBuilder: jest.fn(() => investQB) };
    const kycRepo: any = {
      find: jest.fn().mockResolvedValue([
        { utilisateurId: 1, statut: 'valide', motifRefus: null, id: 'kyc1' },
      ]),
    };

    const controller = new AdminController(
      userRepo,
      /* projectRepo */ {} as any,
      investRepo,
      kycRepo,
      /* ordreRepo */ {} as any,
      /* notificationEvents */ {} as any,
      /* deleteAccountUseCase */ {} as any,
    );
    return { controller, investRepo, investQB };
  };

  const caller = { userId: 99, email: 'a@b.c' } as any;

  // ─── Projection complète (users:read) ──────────────────────────────────────

  it('users:read : projection complète inchangée (e-mail, KYC, montant investi)', async () => {
    const { controller } = makeController(UserRole.COMPLIANCE);

    const res: any = await controller.listUsers(caller);

    expect(res.restricted).toBe(false);
    expect(res.items[0]).toEqual(
      expect.objectContaining({
        userId: 1,
        email: 'jean1@exemple.fr',
        kycStatus: 'valide',
        kycMotifRefus: null,
        kycId: 'kyc1',
        totalInvested: 5000,
      }),
    );
  });

  it('users:read : le mot de passe n\'est jamais renvoyé', async () => {
    const { controller } = makeController(UserRole.COMPLIANCE);

    const res: any = await controller.listUsers(caller);

    expect(res.items[0]).not.toHaveProperty('password');
  });

  // ─── Projection restreinte (aml:manage sans users:read) ────────────────────

  it('rcci : aucun e-mail renvoyé', async () => {
    const { controller } = makeController(UserRole.RCCI);

    const res: any = await controller.listUsers(caller);

    expect(res.restricted).toBe(true);
    for (const item of res.items) expect(item.email).toBeNull();
  });

  it('rcci : ni données financières, ni fiscales, ni Stripe, ni note PEP', async () => {
    const { controller } = makeController(UserRole.RCCI);

    const res: any = await controller.listUsers(caller);

    for (const key of [
      'totalInvested',
      'regimeFiscal',
      'tauxBaremeMarginal',
      'stripeConnectAccountId',
      'pepNote',
      'password',
      'kycMotifRefus',
    ]) {
      expect(res.items[0]).not.toHaveProperty(key);
    }
  });

  it('rcci : conserve de quoi désigner une personne (identité, rôle, statut KYC)', async () => {
    const { controller } = makeController(UserRole.RCCI);

    const res: any = await controller.listUsers(caller);

    expect(res.items[0]).toEqual({
      userId: 1,
      firstname: 'Jean',
      lastname: 'Dupont1',
      role: UserRole.INVESTISSEUR,
      status: 'actif',
      email: null,
      kycStatus: 'valide',
    });
  });

  it('rcci : les montants investis ne sont même pas calculés', async () => {
    const { controller, investRepo } = makeController(UserRole.RCCI);

    await controller.listUsers(caller);

    expect(investRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rcci : la recherche par e-mail ne peut pas servir d\'oracle', async () => {
    const { controller } = makeController(UserRole.RCCI);

    // L'adresse existe bien en base, mais la recherche restreinte ne matche
    // que sur le nom : rien ne doit remonter.
    const res: any = await controller.listUsers(
      caller,
      undefined,
      undefined,
      'jean1@exemple.fr',
    );

    expect(res.items).toEqual([]);
  });

  it('rcci : la recherche par nom fonctionne toujours', async () => {
    const { controller } = makeController(UserRole.RCCI);

    const res: any = await controller.listUsers(
      caller,
      undefined,
      undefined,
      'Dupont1',
    );

    expect(res.items).toHaveLength(1);
    expect(res.items[0].userId).toBe(1);
  });

  it('users:read : la recherche par e-mail reste possible', async () => {
    const { controller } = makeController(UserRole.COMPLIANCE);

    const res: any = await controller.listUsers(
      caller,
      undefined,
      undefined,
      'jean2@exemple.fr',
    );

    expect(res.items).toHaveLength(1);
    expect(res.items[0].userId).toBe(2);
  });

  // ─── Défense en profondeur ─────────────────────────────────────────────────

  it('rôle en base sans users:read ni aml:manage : 403 même si le JWT prétend le contraire', async () => {
    const { controller } = makeController(UserRole.CIO);

    await expect(controller.listUsers(caller)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('utilisateur introuvable en base : 403', async () => {
    const { controller } = makeController(UserRole.COMPLIANCE);
    (controller as any).userRepo.findOne = jest.fn().mockResolvedValue(null);

    await expect(controller.listUsers(caller)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
