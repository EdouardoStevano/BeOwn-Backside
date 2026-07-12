// Normalize phone to a stable cache key (strip spaces, ensure leading +)
export const normalizePhone = (phone: string): string =>
  phone.replace(/\s+/g, '').trim();

export const emailOtpKey = (email: string): string => `otp:email:${email}`;

export const smsOtpKey = (phone: string): string => `otp:sms:${phone}`;
