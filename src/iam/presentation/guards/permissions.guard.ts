import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from 'src/iam/presentation/decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from 'src/iam/presentation/decorators/public.decorator';
import { hasPermission, Permission } from 'src/iam/domain/policies/role-permissions.policy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const role: string | undefined = request.user?.role;
    if (!role || !required.some((p) => hasPermission(role, p))) {
      throw new ForbiddenException('Accès réservé.');
    }
    return true;
  }
}
