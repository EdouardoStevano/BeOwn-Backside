export const AUTH_MAILER = Symbol('AUTH_MAILER');

/**
 * Emails transactionnels du parcours d'authentification. Le port ne transporte
 * que des *données* (destinataire, token, code) : la mise en forme (HTML,
 * objet, construction de l'URL de confirmation à partir de `API_URL`) est un
 * détail de l'adapter, pas une décision applicative — c'est ce qui permet à
 * la couche `applications/` de ne pas connaître le transport ni de générer
 * du HTML (§12.5).
 */
export interface AuthMailer {
  /** Lien de confirmation d'adresse email (parcours legacy `GET /email/verify`). */
  sendEmailVerificationLink(to: string, token: string): Promise<void>;
  /** Code OTP à usage unique du parcours 2FA/connexion. */
  sendLoginOtp(to: string, otp: string): Promise<void>;
}
