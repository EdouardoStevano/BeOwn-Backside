/**
 * Locataire d'un bien — distinct de UserEntity (qui désigne un investisseur/porteur).
 * Données limitées : juste assez pour la facturation et la traçabilité.
 */
export class Locataire {
  id: string;
  nomComplet: string;
  email: string | null;
  telephone: string | null;
  spvId: string; // FK vers Spv (le locataire signe avec la SCI)
  createdAt: Date;
  updatedAt: Date;
}
