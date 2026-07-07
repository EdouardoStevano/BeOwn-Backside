/**
 * Utilitaires partagés des frais plateforme.
 *
 * Les TAUX ne vivent plus ici : ils sont configurables par le super_admin
 * (admin_settings.commissions) et lus via PlatformFeesService, avec
 * DEFAULT_FEE_RATES comme valeurs de repli — voir platform-fees.service.ts.
 * Les frais d'entrée à la souscription ont été supprimés.
 */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
