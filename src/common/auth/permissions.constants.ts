import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Matrice rôle × permission du back-office BeOwn.
 * MIROIR : "BeOwn - Admin/src/utils/permissions.ts" doit rester en phase.
 * Spec : docs/superpowers/specs/2026-07-05-roles-permissions-phase1-design.md (repo Frontside).
 */
export type Permission =
  | 'users:read'
  | 'users:manage'
  | 'users:delete'
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
  | 'echeancier:manage'
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
  | 'reclamations:manage'
  | 'spv:manage'
  | 'relations:manage'
  /**
   * Instruire et décider les demandes d'accès porteur (lot 4, décision D1).
   *
   * Permission DISTINCTE de `users:manage` : accorder l'espace porteur, c'est
   * ouvrir la soumission de projets et la trésorerie d'un projet à un compte,
   * pas éditer une fiche. Elle est accordée explicitement à `compliance` — le
   * rôle qui instruit déjà les dossiers d'entrée en relation ; `super_admin`
   * l'a par le joker.
   */
  | 'porteur_access:review'
  /**
   * Lire les PROFILS COMPLETS d'investisseurs — NIF, patrimoine déclaré,
   * adresse, date et lieu de naissance, résidence fiscale, statut PEP — et les
   * exporter en masse.
   *
   * Permission DISTINCTE de `users:read`, qui ouvre l'annuaire (identité,
   * rôle, statut) : l'annuaire sert à désigner une personne, le profil complet
   * sert à instruire un dossier. `users:read` est détenue par support,
   * marketing, chargé de relation investisseur, dpo et compliance — la liste
   * « investisseurs à contacter » leur servait pourtant l'entité de profil
   * ENTIÈRE, et l'export CSV des investisseurs sortait le fichier nominatif
   * complet sous la seule permission `data:export` (marketing, dpo).
   *
   * Accordée à `compliance` SEUL (`super_admin` l'a par le joker) : c'est le
   * rôle qui instruit les dossiers d'entrée en relation. Minimisation RGPD
   * art. 5.1.c.
   */
  | 'profiles:read_sensitive'
  /**
   * Lire les PIÈCES du dossier KYC d'un autre compte — pièce d'identité,
   * selfie, justificatif de domicile, justificatif de revenu — c'est-à-dire les
   * fichiers eux-mêmes, leurs métadonnées et leur URL de téléchargement signée.
   *
   * Permission DISTINCTE de `users:read` : l'annuaire sert à désigner une
   * personne, pas à ouvrir la photo de sa carte d'identité. `users:read` est
   * détenue par support, marketing, chargé de relation investisseur, dpo et
   * compliance — et `GET /documents/user/:userId` la leur suffisait, ainsi que
   * `data:export` (marketing, dpo), pour lister ET télécharger tout le dossier.
   *
   * Accordée à `compliance` seul — le rôle qui instruit les dossiers d'entrée
   * en relation et rend les décisions KYC (`kyc:validate`) ; `super_admin` l'a
   * par le joker. Séparée de `kyc:validate` par ISP : décider n'est pas lire,
   * et un futur rôle de revue pourra lire sans décider.
   */
  | 'kyc:read_documents'
  /**
   * Lire les pièces KYC placées en ARCHIVAGE RESTREINT
   * (`document.archiveConservationLegale`) : celles d'un compte supprimé,
   * conservées cinq ans après la clôture de la relation au titre de
   * l'art. L. 561-12 CMF et purgées ensuite par le cron RGPD.
   *
   * Le barème (§ 2.3, note d'implémentation) exige que la restriction soit
   * APPLICATIVE, Cloudinary n'ayant pas d'accès restreint natif : le marqueur
   * ne servait à rien tant qu'aucune lecture ne le filtrait. « Archivé » veut
   * dire sorti des écrans courants — y compris de ceux de la conformité en
   * usage ordinaire — et n'est ré-ouvert que par un accès explicitement dédié.
   *
   * Accordée à `compliance` seul (`super_admin` par le joker), conformément au
   * barème : « accès rôle conformité/DPO uniquement ». Le dpo de BeOwn n'a pas
   * `kyc:validate` et n'instruit pas les dossiers : lui ouvrir l'archive
   * élargirait l'accès au lieu de le restreindre.
   */
  | 'kyc:read_archive';

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
  // `echeancier:manage` — MUTATION de l'échéancier (création, régénération,
  // modification et suppression d'échéances). Séparée de `echeancier:read`
  // parce qu'une permission de LECTURE ne doit jamais autoriser une écriture :
  // rcci, rôle de CONTRÔLE, garde `echeancier:read` (il doit pouvoir consulter)
  // mais ne doit pas pouvoir altérer un échéancier qu'il a mission d'auditer.
  // Le paiement effectif reste sur `echeancier:pay` (super_admin seul).
  'echeancier:manage',
  'projects:read',
  'reports:read',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[] | [Wildcard]> = {
  [UserRole.SUPER_ADMIN]: [WILDCARD],
  [UserRole.CIO]: CIO_PERMISSIONS,
  [UserRole.FINANCIER]: CIO_PERMISSIONS,
  [UserRole.COMPLIANCE]: [
    'kyc:validate',
    'reclamations:manage',
    'aml:manage',
    'users:read',
    'users:manage',
    'projects:read',
    'reports:read',
    'porteur_access:review',
    'profiles:read_sensitive',
    'kyc:read_documents',
    'kyc:read_archive',
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
    'reclamations:manage',
    'users:read',
    'projects:read',
    'reservations:manage',
    'news:manage',
    'notifications:manage',
  ],
  [UserRole.RCCI]: [
    'audit:read',
    'reclamations:manage',
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

/**
 * Un rôle de back-office est un rôle qui détient AU MOINS une permission —
 * par opposition aux rôles de plateforme (investisseur, porteur, cgp), dont la
 * liste de permissions est vide.
 *
 * Sert aux gardes « on ne sanctionne pas un pair » : suspendre un compte
 * administrateur ne relève pas de la modération d'utilisateurs mais de la
 * gouvernance des accès. Défini à partir de la MATRICE, pas d'une liste de
 * rôles recopiée : un rôle de back-office ajouté demain y entre tout seul —
 * une énumération manuelle, elle, l'aurait oublié (OCP).
 */
export function isBackOfficeRole(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as UserRole];
  if (!perms) return false;
  return perms.length > 0;
}
