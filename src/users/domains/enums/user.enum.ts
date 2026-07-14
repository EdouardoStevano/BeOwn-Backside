/**
 * Vocabulaire métier du contexte Users. Ces enums vivent dans le domaine : c'est
 * l'entité TypeORM qui les importe pour typer ses colonnes, jamais l'inverse.
 */

export enum UserRole {
  INVESTISSEUR = 'investisseur',
  PORTEUR = 'porteur',
  ADMIN = 'admin',
  SUPPORT = 'support',
  COMPLIANCE = 'compliance',
  DPO = 'dpo',
  RCCI = 'rcci',
  FINANCIER = 'financier',
  CGP = 'cgp',
}

export enum UserStatus {
  CREE = 'cree',
  EMAIL_VERIFIE = 'email_verifie',
  ACTIF = 'actif',
  SUSPENDU = 'suspendu',
  CLOS = 'clos',
  SUPPRIME = 'supprime',
}

/**
 * Rôles disposant d'un accès back-office. Défini ici, dans le domaine, parce que
 * « qui est administrateur » est une règle métier — pas une constante de contrôleur.
 */
export const ADMIN_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.COMPLIANCE,
  UserRole.FINANCIER,
  UserRole.RCCI,
];

export enum UserType {
  PP = 'PP',
  PM = 'PM',
}

/**
 * Les trois canaux de second facteur. Un compte n'en active qu'un à la fois :
 * c'est `UserPreferences.twoFactorMethod` qui dit lequel, et `null` qui dit
 * « pas de 2FA ».
 */
export enum TwoFactorMethod {
  EMAIL = 'email',
  SMS = 'sms',
  TOTP = 'totp',
}

export enum RegimeFiscal {
  PFU = 'PFU',
  BAREME = 'BAREME',
  DISPENSE = 'DISPENSE',
}
