/** Profil normalisé retourné par un fournisseur OAuth (Google, Facebook, LinkedIn). */
export interface SocialProfile {
  email: string;
  firstname: string;
  lastname?: string;
  picture?: string;
  socialId: string;
}
