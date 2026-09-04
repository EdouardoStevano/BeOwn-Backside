import { registerAs } from '@nestjs/config';

/**
 * Durées de vie des tokens émis par IAM. Le secret, l'émetteur et l'audience
 * par défaut ne sont plus ici : ils appartiennent au driver de signature et
 * vivent avec lui, dans `src/shared/token/infrastructure/config/token-signer.config.ts`.
 * Cette config ne décrit donc plus que de la politique IAM — ce qu'un
 * changement de driver ne doit pas faire bouger.
 */
export default registerAs('jwt', () => ({
  accessTokenTtl: parseInt(process.env.JWT_ACCESS_TOKEN_TTL ?? '3600', 10),
  refreshTokenTtl: parseInt(process.env.JWT_REFRESH_TOKEN_TTL ?? '86400', 10),
  emailTokenTtl: parseInt(process.env.JWT_TOKEN_EMAIL_TTL ?? '86400', 10),
  // 90 jours : un lien de désinscription doit rester cliquable longtemps
  // après l'envoi (email archivé), sinon la désinscription devient un
  // parcours cassé — et un lien mort est pire qu'un opt-out.
  unsubscribeTokenTtl: parseInt(
    process.env.JWT_TOKEN_UNSUBSCRIBE_TTL ?? '7776000',
    10,
  ),
  /**
   * Exige le claim `type` sur les jetons de session (fail-closed par défaut).
   * Passer à `false` UNIQUEMENT le temps d'un déploiement, pour ne pas
   * déconnecter les sessions ouvertes avant l'ajout de l'estampille — voir
   * `accepteCommeJetonDacces` pour ce que cette fenêtre réexpose.
   */
  requireTypeClaim: (process.env.JWT_REQUIRE_TYPE_CLAIM ?? 'true') !== 'false',
}));
