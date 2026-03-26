import { registerAs } from '@nestjs/config';

export default registerAs('otp', () => {
  return {
    otpTtl: Number(process.env.OTP_TTL || 300),
    maxAttemps: Number(process.env.OTP_MAX_ATTEMPS || 3),
  };
});
