import { registerAs } from '@nestjs/config';

/**
 * Réglages propres à l'OTP d'inscription. Séparés d'`otp.config` (le second
 * facteur) : le code d'inscription vit plus longtemps (on le lit dans une boîte
 * mail, pas dans un SMS reçu dans la seconde) et tolère plus de tentatives.
 */
const DEFAULT_TTL_SECONDS = 600;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

export default registerAs('registrationOtp', () => ({
  ttlSeconds: Number(process.env.REGISTRATION_OTP_TTL) || DEFAULT_TTL_SECONDS,
  maxAttempts:
    Number(process.env.REGISTRATION_OTP_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS,
  resendCooldownSeconds:
    Number(process.env.REGISTRATION_OTP_RESEND_COOLDOWN) ||
    DEFAULT_RESEND_COOLDOWN_SECONDS,
}));
