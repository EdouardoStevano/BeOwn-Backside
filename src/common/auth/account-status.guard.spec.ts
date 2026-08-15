import {
  ExecutionContext,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountStatusGuard } from './account-status.guard';
import {
  ACCOUNT_CLOSED_CODE,
  ACCOUNT_CLOSED_MESSAGE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
} from 'src/iam/domains/errors';
import { UserStatus } from 'src/iam/domains/enums/user.enum';

const ctx = (userId: number | undefined, isPublic = false): ExecutionContext =>
  ({
    getHandler: () => ({ __isPublic: isPublic }),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

const makeGuard = (found: unknown, isPublic = false) => {
  const userRepo = { findOne: jest.fn().mockResolvedValue(found) };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  return {
    guard: new AccountStatusGuard(reflector, userRepo as any),
    userRepo,
  };
};

const expectRejection = async (
  guard: AccountStatusGuard,
  context: ExecutionContext,
  expectedBody: Record<string, unknown>,
) => {
  let caught: UnauthorizedException | undefined;
  try {
    await guard.canActivate(context);
  } catch (e) {
    caught = e as UnauthorizedException;
  }
  expect(caught).toBeInstanceOf(UnauthorizedException);
  expect(caught!.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  const body = caught!.getResponse() as Record<string, unknown>;
  expect(body).toEqual(expectedBody);
};

describe('AccountStatusGuard', () => {
  it('laisse passer un compte actif', async () => {
    const { guard, userRepo } = makeGuard({
      userId: 42,
      status: UserStatus.ACTIF,
    });
    await expect(guard.canActivate(ctx(42))).resolves.toBe(true);
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 42 },
      select: ['userId', 'status'],
    });
  });

  it('refuse (401 + code ACCOUNT_SUSPENDED) un compte suspendu', async () => {
    const { guard } = makeGuard({ userId: 42, status: UserStatus.SUSPENDU });
    await expectRejection(guard, ctx(42), {
      statusCode: HttpStatus.UNAUTHORIZED,
      message: ACCOUNT_SUSPENDED_MESSAGE,
      code: ACCOUNT_SUSPENDED_CODE,
    });
  });

  it.each([UserStatus.CLOS, UserStatus.SUPPRIME])(
    'refuse (401 + code ACCOUNT_CLOSED) le statut %s',
    async (status) => {
      const { guard } = makeGuard({ userId: 42, status });
      await expectRejection(guard, ctx(42), {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: ACCOUNT_CLOSED_MESSAGE,
        code: ACCOUNT_CLOSED_CODE,
      });
    },
  );

  it('refuse (401 + code ACCOUNT_CLOSED) si le compte a disparu de la base', async () => {
    const { guard } = makeGuard(null);
    await expectRejection(guard, ctx(42), {
      statusCode: HttpStatus.UNAUTHORIZED,
      message: ACCOUNT_CLOSED_MESSAGE,
      code: ACCOUNT_CLOSED_CODE,
    });
  });

  it('ignore les routes publiques sans requêter la base', async () => {
    const { guard, userRepo } = makeGuard(
      { userId: 42, status: UserStatus.SUSPENDU },
      true,
    );
    await expect(guard.canActivate(ctx(42, true))).resolves.toBe(true);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('laisse passer quand aucun utilisateur authentifié (rien à vérifier ici)', async () => {
    const { guard, userRepo } = makeGuard(null);
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });
});
