/** Profil renvoyé par un fournisseur OAuth après consentement de l'utilisateur. */
export interface SocialProfile {
  email: string;
  firstname: string;
  lastname?: string;
  picture?: string;
  socialId: string;
}
