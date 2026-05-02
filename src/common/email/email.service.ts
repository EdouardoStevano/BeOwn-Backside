export const EMAIL_SERVICE = Symbol('MAIL_SERVICE');

export interface EmailService {
  sendActivationEmail(email: string, otp: string): Promise<void>;
  sendTwoFactorCodeEmail(email: string, otp: string): Promise<void>;
  sendPasswordResetEmail?(email: string, token: string): Promise<void>;
  sendKycStatusEmail?(
    email: string,
    status: string,
    motif?: string,
  ): Promise<void>;
  sendTransactionalEmail?(
    email: string,
    subject: string,
    htmlContent: string,
  ): Promise<void>;
}
