import { registerAs } from '@nestjs/config';

/**
 * Réglages du **driver** de signature, et rien de plus : secret, émetteur,
 * audience par défaut. Les durées de vie des tokens métier (accès,
 * rafraîchissement, email, désinscription) restent dans le contexte qui les
 * émet — `src/iam/infrastructure/config/jwt.config.ts` — parce que ce sont
 * des règles de sécurité applicative, pas des paramètres du driver (CRP, §5).
 *
 * Les noms de variables d'environnement sont inchangés : rien à modifier au
 * déploiement.
 */
export default registerAs('tokenSigner', () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return {
    secret,
    audience: process.env.JWT_TOKEN_AUDIENCE || 'localhost:3000',
    issuer: process.env.JWT_TOKEN_ISSUER || 'localhost:3000',
  };
});
