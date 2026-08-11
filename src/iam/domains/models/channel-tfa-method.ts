/**
 * Méthode 2FA « à canal » enrôlée par un utilisateur : email ou SMS. Le code
 * n'y est pas stocké — il vit dans l'`OtpStore` le temps de son TTL. Seule la
 * destination est persistée, ce qui distingue ce modèle de {@link TotpMethod},
 * qui porte un secret partagé chiffré (§12.7 : modèle de domaine ≠ entité ORM).
 */
export interface ChannelTfaMethod {
  id: number;
  isActive: boolean;
  /** Destination du code : adresse email ou numéro E.164 selon le canal. */
  target: string;
}
