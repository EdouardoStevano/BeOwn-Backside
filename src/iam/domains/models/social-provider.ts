/**
 * Fournisseurs OAuth supportés par le contexte IAM.
 *
 * Vocabulaire du domaine, volontairement placé ici et non dans `infrastructure/`
 * : les guards (`presenters/`) et les stratégies Passport (`infrastructure/`)
 * s'en servent tous les deux, et ces deux couches ne doivent jamais dépendre
 * l'une de l'autre (§12.9). La valeur sert aussi de nom de stratégie Passport —
 * coïncidence pratique, pas une dépendance à Passport.
 */
export enum Social {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  LINKEDIN = 'linkedin',
}
