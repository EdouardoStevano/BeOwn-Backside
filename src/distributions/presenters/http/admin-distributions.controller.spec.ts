import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AdminDistributionsController } from './admin-distributions.controller';

/**
 * `POST /admin/distributions/:id/execute` crédite les portefeuilles des
 * bénéficiaires et débite les séquestres fiscaux. Le rôle transmis au use case
 * — donc celui inscrit à l'audit du versement — venait du CLAIM du jeton.
 */
describe('AdminDistributionsController.execute — rôle relu en base', () => {
  const makeController = (roleEnBase: UserRole | null) => {
    const executeUseCase = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          roleEnBase === null ? null : { userId: 3, role: roleEnBase },
        ),
    };
    return {
      controller: new AdminDistributionsController(
        /* calculateUseCase */ {} as any,
        /* validateUseCase */ {} as any,
        executeUseCase as any,
        /* cronService */ {} as any,
        /* periodeRepo */ {} as any,
        /* partRepo */ {} as any,
        userRepo as any,
      ),
      executeUseCase,
    };
  };

  it("transmet le rôle EN BASE au use case, pas celui du jeton", async () => {
    const { controller, executeUseCase } = makeController(UserRole.CIO);

    await controller.execute('periode-1', {
      userId: 3,
      role: UserRole.SUPER_ADMIN,
    } as any);

    expect(executeUseCase.execute).toHaveBeenCalledWith(
      'periode-1',
      3,
      UserRole.CIO,
    );
  });

  it('refuse un rôle sans distributions:execute en base', async () => {
    const { controller, executeUseCase } = makeController(UserRole.SUPPORT);

    await expect(
      controller.execute('periode-1', {
        userId: 3,
        role: UserRole.SUPER_ADMIN,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeUseCase.execute).not.toHaveBeenCalled();
  });

  it('refuse un compte disparu', async () => {
    const { controller, executeUseCase } = makeController(null);

    await expect(
      controller.execute('periode-1', { userId: 3, role: UserRole.CIO } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeUseCase.execute).not.toHaveBeenCalled();
  });
});
