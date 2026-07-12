// Normalize phone to a stable cache key (strip spaces, ensure leading +)
export const normalizePhone = (phone: string): string =>
  phone.replace(/\s+/g, '').trim();

export const emailOtpKey = (email: string): string => `otp:email:${email}`;

export const smsOtpKey = (phone: string): string => `otp:sms:${phone}`;

const DEFAULT_OTP_TTL_SECONDS = 300;

/**
 * Libellé d'expiration affiché dans l'email, dérivé du TTL réel (OTP_TTL)
 * pour que le message ne contredise jamais la durée de vie en cache.
 */
export const otpExpiryLabel = (): string => {
  const ttl = Number(process.env.OTP_TTL) || DEFAULT_OTP_TTL_SECONDS;

  if (ttl % 60 !== 0) return `${ttl} secondes`;

  const minutes = ttl / 60;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};
