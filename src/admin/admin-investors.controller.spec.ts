import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminInvestorsController } from './admin-investors.controller';
import { UserRole } from 'src/iam/domain/enums/user.enum';

describe('AdminInvestorsController.changeRole', () => {
  const admin = { userId: 1 } as any;
  const riskScoring = {} as any;

  const makeUserRepo = (usersById: Record<number, any>, remainingSuperAdmins = 1) => ({
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(usersById[where.userId] ?? null),
    ),
    count: jest.fn().mockResolvedValue(remainingSuperAdmins),
    save: jest.fn().mockImplementation((u: any) => Promise.resolve(u)),
  });

  it('refuse un rôle inconnu (BadRequest)', async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
    });
    const controller = new AdminInvestorsController(userRepo as any, riskScoring);

    await expect(
      controller.changeRole(5, { role: 'not-a-real-role' }, admin),
    ).rejects.toThrow(BadRequestException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("refuse si l'utilisateur cible est introuvable (NotFound)", async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
    });
    const controller = new AdminInvestorsController(userRepo as any, riskScoring);

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
    const controller = new AdminInvestorsController(userRepo as any, riskScoring);

    const result = await controller.changeRole(5, { role: UserRole.CGP }, admin);

    expect(result).toEqual({ userId: 5, role: UserRole.CGP });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, role: UserRole.CGP }),
    );
  });

  it('refuse de modifier son propre rôle (BadRequest)', async () => {
    const userRepo = makeUserRepo({
      1: { userId: 1, role: UserRole.SUPER_ADMIN },
    });
    const controller = new AdminInvestorsController(userRepo as any, riskScoring);

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
    const controller = new AdminInvestorsController(userRepo as any, riskScoring);

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
    const controller = new AdminInvestorsController(userRepo as any, riskScoring);

    const result = await controller.changeRole(2, { role: UserRole.CIO }, admin);

    expect(result).toEqual({ userId: 2, role: UserRole.CIO });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, role: UserRole.CIO }),
    );
  });
});
