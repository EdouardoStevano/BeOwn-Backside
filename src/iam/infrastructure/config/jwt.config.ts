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
    // Volontairement court : un lien de reset est bien plus sensible qu'un lien
    // de confirmation d'email. 30 minutes par défaut.
    passwordResetTtl: parseInt(
      process.env.JWT_PASSWORD_RESET_TTL ?? '1800',
      10,
    ),
    // Le temps de lire un SMS et de le recopier, pas davantage : ce jeton vaut
    // « mot de passe déjà validé ». 5 minutes, comme le TTL d'un OTP.
    twoFactorChallengeTtl: parseInt(
      process.env.JWT_TWO_FACTOR_CHALLENGE_TTL ?? '300',
      10,
    ),
  };
});
