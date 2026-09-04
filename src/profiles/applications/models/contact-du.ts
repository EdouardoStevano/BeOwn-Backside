/**
 * Ce qu'un chargé de relation a besoin de savoir pour APPELER quelqu'un :
 * de quoi l'identifier et le joindre, et depuis quand il n'a pas été
 * contacté. Rien d'autre.
 *
 * Ce read model remplace le renvoi de `ProfilPPEntity[]` par
 * `GET /admin/investors/due-contacts` : la route servait l'entité de profil
 * ENTIÈRE — NIF, patrimoine net déclaré, adresse postale, date et lieu de
 * naissance, nationalité, résidence fiscale, téléphone, profession, statut PEP
 * — à tout rôle détenant `users:read`, c'est-à-dire support, marketing, chargé
 * de relation investisseur et dpo. Aucun de ces champs n'est nécessaire pour
 * décider d'un appel de suivi (minimisation, art. 5.1.c RGPD).
 *
 * La projection est faite DANS LA REQUÊTE (colonnes sélectionnées), pas après
 * coup dans le contrôleur : les données sensibles ne quittent jamais la base.
 */
export interface ContactDu {
  utilisateurId: number;
  nom: string;
  prenom: string;
  email: string | null;
  dernierContactAdmin: Date | null;
}

/**
 * Borne dure de la liste. La requête est déjà plafonnée côté service ; la
 * constante est nommée pour que le plafond soit visible du contrat, et non
 * enfoui dans un `take:` — une liste de suivi qui déborderait ce volume est un
 * problème d'organisation, pas un problème de pagination.
 */
export const PLAFOND_CONTACTS_DUS = 500;
