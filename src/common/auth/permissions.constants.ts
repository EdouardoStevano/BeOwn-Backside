import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

/**
 * Matrice rôle × permission du back-office BeOwn.
 * MIROIR : "BeOwn - Admin/src/utils/permissions.ts" doit rester en phase.
 * Spec : docs/superpowers/specs/2026-07-05-roles-permissions-phase1-design.md (repo Frontside).
 */
export type Permission =
  | 'users:read'
  | 'users:manage'
  | 'roles:assign'
  | 'kyc:validate'
  | 'aml:manage'
  | 'projects:read'
  | 'projects:manage'
  | 'projects:publish'
  | 'projects:validate'
  | 'sorties:execute'
  | 'funds:disburse'
  | 'funds:refund'
  | 'echeancier:read'
  | 'echeancier:pay'
  | 'retraits:manage'
  | 'distributions:execute'
  | 'fiscal:manage'
  | 'locatif:manage'
  | 'market:manage'
  | 'reservations:manage'
  | 'reports:read'
  | 'data:export'
  | 'crm:hubspot'
  | 'news:manage'
  | 'notifications:manage'
  | 'settings:manage'
  | 'platform:wallet'
  | 'audit:read'
  | 'spv:manage'
  | 'relations:manage';

const WILDCARD = '*' as const;
type Wildcard = typeof WILDCARD;

/** Périmètre « tout ce qui est argent et finance » — partagé cio / financier (legacy). */
const CIO_PERMISSIONS: Permission[] = [
  'funds:disburse',
  'funds:refund',
  'retraits:manage',
  'distributions:execute',
  'sorties:execute',
  'fiscal:manage',
  'locatif:manage',
  'market:manage',
  'echeancier:read',
  'projects:read',
  'reports:read',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[] | [Wildcard]> = {
  [UserRole.SUPER_ADMIN]: [WILDCARD],
  [UserRole.CIO]: CIO_PERMISSIONS,
  [UserRole.FINANCIER]: CIO_PERMISSIONS,
  [UserRole.COMPLIANCE]: [
    'kyc:validate',
    'aml:manage',
    'users:read',
    'users:manage',
    'projects:read',
    'reports:read',
  ],
  [UserRole.MARKETING]: [
    'data:export',
    'crm:hubspot',
    'users:read',
    'reports:read',
  ],
  [UserRole.ANALYSTE_FINANCIER]: [
    'projects:read',
    'projects:manage',
    'projects:publish',
    'news:manage',
    'reservations:manage',
    'reports:read',
  ],
  [UserRole.CHARGE_RELATION_INVESTISSEUR]: [
    'relations:manage',
    'spv:manage',
    'projects:read',
    'users:read',
    'reservations:manage',
  ],
  [UserRole.SUPPORT]: [
    'users:read',
    'projects:read',
    'reservations:manage',
    'news:manage',
    'notifications:manage',
  ],
  [UserRole.RCCI]: [
    'audit:read',
    'aml:manage',
    'reports:read',
    'projects:read',
    'echeancier:read',
    'market:manage',
  ],
  [UserRole.DPO]: ['users:read', 'data:export', 'audit:read'],
  [UserRole.INVESTISSEUR]: [],
  [UserRole.PORTEUR]: [],
  [UserRole.CGP]: [],
};

Object.freeze(CIO_PERMISSIONS);
for (const perms of Object.values(ROLE_PERMISSIONS)) Object.freeze(perms);
Object.freeze(ROLE_PERMISSIONS);

/**
 * Vérifie qu'un rôle détient une permission.
 * Accepte volontairement un rôle `string` brut (JWT `request.user.role`) :
 * tout rôle inconnu — y compris l'ancien 'admin' d'un token émis avant la
 * migration — est refusé par défaut (le guard renverra 403, forçant une
 * reconnexion). Ne pas restreindre la signature à UserRole.
 */
export function hasPermission(
  role: UserRole | string | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as UserRole];
  if (!perms) return false;
  return perms[0] === WILDCARD || (perms as Permission[]).includes(permission);
}

/** Rôles détenant une permission — pour les checks défense-en-profondeur en base. */
export function rolesWithPermission(permission: Permission): UserRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((r) =>
    hasPermission(r, permission),
  );
}
