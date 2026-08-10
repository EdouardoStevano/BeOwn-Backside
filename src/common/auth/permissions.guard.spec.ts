import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { Permission } from './permissions.constants';

const ctx = (role?: string): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    // getResponse/getNext omis — le guard n'utilise que getRequest
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  const withMeta = (perms: Permission[] | undefined, isPublic = false) => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === IS_PUBLIC_KEY ? isPublic : perms,
      );
  };

  it('laisse passer si aucune permission requise', () => {
    withMeta(undefined);
    expect(guard.canActivate(ctx(UserRole.MARKETING))).toBe(true);
  });

  it('laisse passer les routes publiques', () => {
    withMeta(['retraits:manage'], true);
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('autorise un rôle détenant la permission', () => {
    withMeta(['retraits:manage']);
    expect(guard.canActivate(ctx(UserRole.CIO))).toBe(true);
  });

  it('autorise super_admin partout (wildcard)', () => {
    withMeta(['echeancier:pay']);
    expect(guard.canActivate(ctx(UserRole.SUPER_ADMIN))).toBe(true);
  });

  it('refuse un rôle sans la permission', () => {
    withMeta(['retraits:manage']);
    expect(() => guard.canActivate(ctx(UserRole.MARKETING))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse sans utilisateur', () => {
    withMeta(['users:read']);
    expect(() => guard.canActivate(ctx())).toThrow(ForbiddenException);
  });

  it('OU logique : une seule permission suffit', () => {
    withMeta(['reports:read', 'data:export']);
    expect(guard.canActivate(ctx(UserRole.DPO))).toBe(true); // n'a que data:export
  });
});
