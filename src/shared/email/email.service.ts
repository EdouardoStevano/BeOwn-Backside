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

  // F4 transactional emails
  sendKycValidatedEmail?(email: string, prenom: string): Promise<void>;
  sendKycRejectedEmail?(
    email: string,
    prenom: string,
    motif?: string,
  ): Promise<void>;
  sendNewProjectEmail?(
    email: string,
    prenom: string,
    projet: { titre: string; ville: string; triCible?: number; url?: string },
  ): Promise<void>;
  /**
   * `unsubscribeUrl` : lien de désinscription EXIGÉ pour toute prospection par
   * voie électronique (art. L.34-5 CPCE). Il est optionnel dans la signature
   * parce que le template ne l'affiche que s'il est fourni — un appelant qui
   * l'oublie n'envoie pas un lien mort, il n'envoie pas de lien du tout, ce
   * qui se voit à la relecture au lieu de se cacher dans un `href=""`.
   */
  sendNewSecondaryOrderEmail?(
    email: string,
    prenom: string,
    projet: { titre: string; nbFractions: number; prix: number },
    unsubscribeUrl?: string,
  ): Promise<void>;
  /** Versement du net d'une période de distribution (revenus locatifs). */
  sendDistributionEmail?(
    email: string,
    prenom: string,
    distribution: { montant: number; projetTitre: string; periode: string },
  ): Promise<void>;
  sendEcheanceEmail?(
    email: string,
    prenom: string,
    echeance: { date: string; montant: number; projetTitre: string },
  ): Promise<void>;
  sendDepotConfirmedEmail?(
    email: string,
    prenom: string,
    montant: number,
  ): Promise<void>;
  sendRetraitProcessedEmail?(
    email: string,
    prenom: string,
    montant: number,
  ): Promise<void>;
}
