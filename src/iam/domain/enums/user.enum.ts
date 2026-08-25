/**
 * Vocabulaire du compte utilisateur.
 *
 * Ces enums vivaient dans `infrastructure/persistences/entities/user.entity.ts`,
 * ce qui obligeait le domaine et une soixantaine de fichiers applicatifs (dont
 * les usecases IAM et les guards) à importer une classe ORM pour lire un statut
 * ou un rôle — §12.1 et §12.7. L'entité TypeORM les importe désormais depuis
 * ici : la dépendance va de l'infrastructure vers le domaine, jamais l'inverse.
 */

export enum UserRole {
  // Utilisateurs plateforme
  /**
   * Compte ouvert, mais qui n'a pas encore mené son onboarding KYC à son
   * terme. C'est le rôle de départ de toute inscription.
   *
   * Il ne donne accès à rien de plus qu'un visiteur anonyme authentifié :
   * consulter, compléter son dossier. Aucune opération financière — celles-ci
   * sont de toute façon gardées par `KycValidatedGuard`, qui interroge le
   * dossier de conformité et non le rôle. Le rôle **suit** cette vérification,
   * il ne la remplace pas : `UpdateKycStatusUseCase` fait passer le compte à
   * INVESTISSEUR quand le dossier devient VALIDE.
   */
  VISITEUR = 'visiteur',
  INVESTISSEUR = 'investisseur',
  PORTEUR = 'porteur',
  CGP = 'cgp',
  // Back-office — nouveaux rôles (2026-07)
  SUPER_ADMIN = 'super_admin',
  CIO = 'cio',
  MARKETING = 'marketing',
  ANALYSTE_FINANCIER = 'analyste_financier',
  CHARGE_RELATION_INVESTISSEUR = 'charge_relation_investisseur',
  // Back-office — legacy conservés
  SUPPORT = 'support',
  COMPLIANCE = 'compliance',
  DPO = 'dpo',
  RCCI = 'rcci',
  FINANCIER = 'financier',
}

export enum UserStatus {
  CREE = 'cree',
  EMAIL_VERIFIE = 'email_verifie',
  ACTIF = 'actif',
  SUSPENDU = 'suspendu',
  CLOS = 'clos',
  SUPPRIME = 'supprime',
}

export enum UserType {
  PP = 'PP',
  PM = 'PM',
}

/**
 * Régime fiscal de l'investisseur (personne). À ne pas confondre avec
 * `catalog/domain/enums/regime-fiscal.enum.ts` (IR/IS), qui qualifie le
 * projet — même nom, deux contextes, deux concepts.
 */
export enum RegimeFiscal {
  PFU = 'PFU',
  BAREME = 'BAREME',
  DISPENSE = 'DISPENSE',
}
