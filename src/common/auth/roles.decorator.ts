import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route or controller to one or more user roles.
 * Resolved by RolesGuard against `request.user.role` (set by JwtAuthGuard).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
