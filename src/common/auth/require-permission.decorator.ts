import { SetMetadata } from '@nestjs/common';
import { Permission } from './permissions.constants';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Restreint une route/un contrôleur aux rôles détenant AU MOINS UNE des
 * permissions données (OU logique). Résolu par PermissionsGuard via la
 * matrice ROLE_PERMISSIONS.
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
