export const OTP_SERVICE = Symbol('OTP_SERVICE');

export interface SecretOtpPayload {
  uri: string;
  secret: string;
}

export interface OtpService {
  generateOtp(key: string): Promise<string>;
  verifyOtp(key: string, otp: string): Promise<boolean>;
  generateSecretTotp(email: string): SecretOtpPayload;
  verifyTotp(otp: string, secret: string): any;
}
