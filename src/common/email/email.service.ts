export const EMAIL_SERVICE = Symbol('MAIL_SERVICE');

export interface EmailService {
  sendActivationEmail(email: string, otp: string): Promise<void>;
  sendTwoFactorCodeEmail(email: string, otp: string): Promise<void>;

  /** Code de vérification à usage unique (flux OTP email). `expiresIn` est un
   *  libellé prêt à afficher, ex. « 5 minutes ». */
  sendOtpEmail(email: string, otp: string, expiresIn: string): Promise<void>;
  sendPasswordResetEmail?(email: string, token: string): Promise<void>;
  sendKycStatusEmail?(email: string, status: string, motif?: string): Promise<void>;
  sendTransactionalEmail?(email: string, subject: string, htmlContent: string): Promise<void>;

  // F4 transactional emails
  sendKycValidatedEmail?(email: string, prenom: string): Promise<void>;
  sendKycRejectedEmail?(email: string, prenom: string, motif?: string): Promise<void>;
  sendNewProjectEmail?(email: string, prenom: string, projet: { titre: string; ville: string; triCible?: number; url?: string }): Promise<void>;
  sendNewSecondaryOrderEmail?(email: string, prenom: string, projet: { titre: string; nbFractions: number; prix: number }): Promise<void>;
  sendEcheanceEmail?(email: string, prenom: string, echeance: { date: string; montant: number; projetTitre: string }): Promise<void>;
  sendDepotConfirmedEmail?(email: string, prenom: string, montant: number): Promise<void>;
  sendRetraitProcessedEmail?(email: string, prenom: string, montant: number): Promise<void>;
}
