import { registerAs } from '@nestjs/config';

const DEFAULT_OTP_TTL_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 3;

export default registerAs('otp', () => ({
  ttlSeconds: Number(process.env.OTP_TTL) || DEFAULT_OTP_TTL_SECONDS,
  maxAttempts: Number(process.env.MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS,
  appName: process.env.TFA_APP_NAME ?? 'BeOwn',
}));
