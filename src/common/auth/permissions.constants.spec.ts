import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  hasPermission,
  rolesWithPermission,
  ROLE_PERMISSIONS,
  type Permission,
} from './permissions.constants';

describe('permissions.constants', () => {
  it('super_admin a toutes les permissions (wildcard)', () => {
    expect(hasPermission(UserRole.SUPER_ADMIN, 'echeancier:pay')).toBe(true);
    expect(hasPermission(UserRole.SUPER_ADMIN, 'platform:wallet')).toBe(true);
  });

  it('les exclusivités super_admin sont refusées aux autres rôles', () => {
    const exclusives = [
      'echeancier:pay',
      'projects:validate',
      'platform:wallet',
      'roles:assign',
      'users:delete',
    ] as const;
    const others = Object.values(UserRole).filter(
      (r) => r !== UserRole.SUPER_ADMIN,
    );
    for (const role of others)
      for (const perm of exclusives)
        expect(hasPermission(role, perm)).toBe(false);
  });

  it('compliance valide les KYC mais ne décaisse pas', () => {
    expect(hasPermission(UserRole.COMPLIANCE, 'kyc:validate')).toBe(true);
    expect(hasPermission(UserRole.COMPLIANCE, 'funds:disburse')).toBe(false);
  });

  it('cio et financier (legacy) ont le même périmètre', () => {
    expect(ROLE_PERMISSIONS[UserRole.FINANCIER]).toEqual(
      ROLE_PERMISSIONS[UserRole.CIO],
    );
  });

  it('marketing exporte les données mais ne touche pas aux projets', () => {
    expect(hasPermission(UserRole.MARKETING, 'data:export')).toBe(true);
    expect(hasPermission(UserRole.MARKETING, 'projects:manage')).toBe(false);
  });

  it('investisseur/porteur/cgp : aucune permission back-office', () => {
    for (const role of [UserRole.INVESTISSEUR, UserRole.PORTEUR, UserRole.CGP])
      expect(ROLE_PERMISSIONS[role]).toEqual([]);
  });

  it('rolesWithPermission retourne les rôles + super_admin', () => {
    const roles = rolesWithPermission('retraits:manage');
    expect(roles).toContain(UserRole.SUPER_ADMIN);
    expect(roles).toContain(UserRole.CIO);
    expect(roles).toContain(UserRole.FINANCIER);
    expect(roles).not.toContain(UserRole.MARKETING);
  });

  it('la matrice couvre tous les rôles (snapshot anti-régression)', () => {
    expect(ROLE_PERMISSIONS).toMatchSnapshot();
  });

  it('permissions exclusives super_admin : aucune liste explicite ne les contient', () => {
    const explicit = new Set(
      Object.values(ROLE_PERMISSIONS)
        .filter((p) => p[0] !== '*')
        .flat(),
    );
    const wildcardOnly: Permission[] = [
      'roles:assign',
      'projects:validate',
      'echeancier:pay',
      'platform:wallet',
      'settings:manage',
      'users:delete',
    ];
    for (const perm of wildcardOnly) expect(explicit.has(perm)).toBe(false);
  });

  it("un rôle inconnu (ex. ancien 'admin') est refusé par défaut", () => {
    expect(hasPermission('admin', 'users:read')).toBe(false);
    expect(hasPermission(undefined, 'users:read')).toBe(false);
  });
});
