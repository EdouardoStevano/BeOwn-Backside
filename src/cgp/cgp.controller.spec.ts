import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { CgpController } from './cgp.controller';

/**
 * IDOR de rattachement CGP : la route écrivait `client.cgpId = appelant` pour
 * n'importe quel `clientId`, sans aucun consentement du client. Ces tests
 * fixent le contrat corrigé — seule la plateforme rattache, rôle relu en base.
 */
describe('CgpController.linkClient', () => {
  let controller: CgpController;
  let userRepo: any;
  let comptes: Map<number, any>;

  const compte = (userId: number, role: UserRole, cgpId: number | null = null) => ({
    userId,
    role,
    cgpId,
  });

  beforeEach(() => {
    comptes = new Map<number, any>([
      [1, compte(1, UserRole.SUPER_ADMIN)],
      [10, compte(10, UserRole.CGP)],
      [11, compte(11, UserRole.CGP)],
      [20, compte(20, UserRole.INVESTISSEUR)],
    ]);

    userRepo = {
      findOne: jest.fn(({ where }: any) =>
        Promise.resolve(comptes.get(where.userId) ?? null),
      ),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
    };

    controller = new CgpController(userRepo, {} as any);
  });

  const appelant = (userId: number) => ({ userId, email: 'x@y.z', role: 'peu-importe' }) as any;

  it("REFUSE qu'un CGP s'attribue un investisseur (IDOR)", async () => {
    await expect(
      controller.linkClient(20, { cgpId: 10 }, appelant(10)),
    ).rejects.toThrow(ForbiddenException);

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(comptes.get(20).cgpId).toBeNull();
  });

  it("REFUSE qu'un CGP rattache un client au CGP concurrent", async () => {
    await expect(
      controller.linkClient(20, { cgpId: 11 }, appelant(10)),
    ).rejects.toThrow(ForbiddenException);

    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('refuse un investisseur ordinaire', async () => {
    await expect(
      controller.linkClient(20, { cgpId: 10 }, appelant(20)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("refuse un jeton dont le claim role dit super_admin alors que la base dit CGP (rôle relu en base)", async () => {
    const jetonMenteur = { userId: 10, email: 'x@y.z', role: UserRole.SUPER_ADMIN } as any;

    await expect(
      controller.linkClient(20, { cgpId: 10 }, jetonMenteur),
    ).rejects.toThrow(ForbiddenException);
  });

  it('super_admin rattache effectivement le client au CGP DÉSIGNÉ (branche jadis inopérante)', async () => {
    const resultat = await controller.linkClient(20, { cgpId: 11 }, appelant(1));

    expect(resultat).toEqual({ clientId: 20, cgpId: 11, linked: true });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 20, cgpId: 11 }),
    );
  });

  it('refuse un cgpId qui ne désigne pas un CGP', async () => {
    await expect(
      controller.linkClient(20, { cgpId: 1 }, appelant(1)),
    ).rejects.toThrow(NotFoundException);

    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('refuse un client inexistant', async () => {
    await expect(
      controller.linkClient(999, { cgpId: 10 }, appelant(1)),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuse de rattacher un CGP à lui-même', async () => {
    await expect(
      controller.linkClient(10, { cgpId: 10 }, appelant(1)),
    ).rejects.toThrow(BadRequestException);
  });
});
