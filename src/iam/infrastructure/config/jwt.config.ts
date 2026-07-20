import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return {
    secret,
    audience: process.env.JWT_TOKEN_AUDIENCE || 'localhost:3000',
    issuer: process.env.JWT_TOKEN_ISSUER || 'localhost:3000',
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
  };
});
