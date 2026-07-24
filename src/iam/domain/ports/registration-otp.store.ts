export const REGISTRATION_OTP_STORE = Symbol('REGISTRATION_OTP_STORE');

/** L'issue d'une tentative de vérification. */
export enum RegistrationOtpVerdict {
  OK = 'OK',
  INVALID = 'INVALID',
  /** Aucun code en cours : jamais envoyé, déjà consommé, ou TTL écoulé. */
  EXPIRED = 'EXPIRED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
}

/**
 * Le code à 6 chiffres envoyé à l'inscription, qui fait passer un compte de
 * « créé » à « email vérifié ».
 *
 * Port distinct d'`OtpService` (le second facteur) à dessein : les deux flux ne
 * partagent rien — ni durée de vie, ni quota de tentatives, ni anti-rejeu —
 * seulement le motif « un code court, à usage unique ». Les fusionner
 * obligerait l'un à hériter des réglages de l'autre.
 *
 * L'implémentation ne conserve jamais le code en clair : elle en stocke une
 * empreinte, comme pour un mot de passe.
 */
export interface RegistrationOtpStore {
  /**
   * Émet un nouveau code pour cette adresse (en remplaçant le précédent) et
   * (re)démarre le délai anti-renvoi. Renvoie le code en clair : c'est le seul
   * endroit où il existe hors de la boîte mail / du téléphone du destinataire.
   */
  issue(email: string): Promise<string>;

  verify(email: string, code: string): Promise<RegistrationOtpVerdict>;

  /**
   * Efface le code et son délai anti-renvoi, pour qu'un utilisateur dont
   * l'envoi a échoué puisse en redemander un immédiatement au lieu d'attendre
   * la fin du TTL avec un code qu'il n'a jamais reçu.
   */
  invalidate(email: string): Promise<void>;

  /** Un code a-t-il été émis trop récemment pour en renvoyer un autre ? */
  isResendThrottled(email: string): Promise<boolean>;
}
