import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserEntity,
  UserStatus,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { ActiveUser } from './current-user.decorator';
import {
  ACCOUNT_CLOSED_CODE,
  ACCOUNT_CLOSED_MESSAGE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
} from './account-status.codes';

// Les codes vivent dans account-status.codes.ts (aucune dépendance) : les
// erreurs de domaine d'IAM les utilisent aussi, et ne peuvent pas importer un
// guard. Ré-exportés ici pour ne pas casser les imports existants.
export {
  ACCOUNT_CLOSED_CODE,
  ACCOUNT_CLOSED_MESSAGE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
  OTP_REQUIRED_CODE,
  OTP_REQUIRED_MESSAGE,
} from './account-status.codes';

/**
 * Runs after JwtAuthGuard on every request. JwtAuthGuard only verifies the
 * JWT signature/expiry and does not touch the DB, so a token stays "valid"
 * for its full lifetime even if an admin suspends the account a second
 * later. This guard closes that gap: it re-reads the account status from DB
 * on each authenticated request and cuts access immediately once status
 * flips to SUSPENDU/CLOS/SUPPRIME — including for a session that is already
 * connected (no re-login required to be locked out).
 *
 * Cost: one indexed lookup by primary key per request
 * (`SELECT status FROM users WHERE "userId" = $1`), narrowed to a single
 * column via `select`. Negligible relative to the rest of the request
 * pipeline given userId is the PK.
 *
 * Registered as a global APP_GUARD right after JwtAuthGuard (and before
 * RolesGuard/PermissionsGuard) in app.module.ts so authorization guards never
 * see a request.user for a locked-out account.
 */
@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user: ActiveUser | undefined = request.user;
    // No authenticated user at this point (should not happen after
    // JwtAuthGuard on a non-public route, but stay defensive and let
    // downstream guards/handlers deal with it rather than double-erroring).
    if (!user?.userId) return true;

    const found = await this.userRepo.findOne({
      where: { userId: user.userId },
      select: ['userId', 'status'],
    });

    if (found?.status === UserStatus.SUSPENDU) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: ACCOUNT_SUSPENDED_MESSAGE,
        code: ACCOUNT_SUSPENDED_CODE,
      });
    }

    if (
      !found ||
      found.status === UserStatus.CLOS ||
      found.status === UserStatus.SUPPRIME
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: ACCOUNT_CLOSED_MESSAGE,
        code: ACCOUNT_CLOSED_CODE,
      });
    }

    return true;
  }
}
