export const EMAIL_SERVICE = Symbol('MAIL_SERVICE');

export interface EmailService {
  sendActivationEmail(email: string, otp: string): Promise<void>;
  sendTwoFactorCodeEmail(email: string, otp: string): Promise<void>;
  sendVerificationEmail(email: string, verificationUrl: string): Promise<void>;
}
