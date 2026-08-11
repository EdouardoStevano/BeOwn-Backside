/**
 * Canaux de double authentification enrôlables par un utilisateur.
 *
 * Les valeurs sont le contrat public : c'est ce que le front envoie dans le
 * body (`{ "method": "totp" }`), là où le canal était auparavant porté par
 * l'URL (`POST /otp/totp/setup`). Ajouter un canal = une valeur ici + une
 * `TfaEnrollmentStrategy` (§4 Open/Closed), sans toucher au contrôleur.
 */
export enum TfaMethodType {
  TOTP = 'totp',
  EMAIL = 'email',
  SMS = 'sms',
}
