/**
 * Canaux d'authentification multifacteur enrôlables par un utilisateur.
 *
 * Les valeurs sont le contrat public : c'est ce que le front envoie dans le
 * body (`{ "method": "totp" }`), là où le canal était auparavant porté par
 * l'URL (`POST /otp/totp/setup`). Elles restent inchangées malgré le passage
 * de « TFA » à « MFA », qui ne touche que les noms côté code.
 *
 * Ajouter un canal = une valeur ici + une `MfaEnrollmentStrategy`
 * (§4 Open/Closed), sans toucher au contrôleur ni au schéma.
 */
export enum MfaMethodType {
  TOTP = 'totp',
  EMAIL = 'email',
  SMS = 'sms',
}
