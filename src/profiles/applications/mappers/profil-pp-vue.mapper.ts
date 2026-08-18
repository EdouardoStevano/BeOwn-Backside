import { ProfilPP, ProfilPPSnapshot } from 'src/profiles/domains/profil-pp';

/**
 * Ce que le contexte Profiles lit du compte, dans le vocabulaire d'IAM.
 *
 * Un type structurel plutôt que `User` : le dossier n'a besoin que de trois
 * lectures, et les nommer ici dit exactement ce qu'il emprunte au contexte
 * voisin — le reste de l'agrégat (rôle, statut, empreinte du mot de passe) ne
 * le regarde pas.
 */
export interface CompteDuTitulaire {
  firstname: string | null;
  lastname: string | null;
  telephone: string | null;
}

/** L'état civil, dans le vocabulaire du dossier — celui que le front lit. */
export interface EtatCivilPublie {
  prenom: string | null;
  nom: string | null;
  telephone: string | null;
}

/**
 * Ce que publient les routes du profil personne physique : le dossier, plus
 * l'état civil et le numéro que porte désormais le compte.
 */
export type VueProfilPP = ProfilPPSnapshot & EtatCivilPublie;

/**
 * Recompose la vue attendue par le front à partir des deux propriétaires.
 *
 * `prenom`, `nom` et `telephone` ont quitté la table `profil_pp` pour `user`,
 * qui portait déjà les deux premiers. Les retirer de la réponse aurait cassé
 * l'écran de profil, alors qu'ils y restent parfaitement légitimes pour qui la
 * consomme : **une seule source, deux lectures**. La composition se fait ici,
 * une fois, plutôt que dans chacune des trois routes — et la traduction de
 * vocabulaire (`firstname` → `prenom`) avec elle.
 *
 * `null` plutôt qu'absent quand le compte n'a rien : le front distingue « pas
 * de nom de famille » de « champ disparu de l'API ».
 */
export function vueProfilPP(
  profil: ProfilPP,
  compte: CompteDuTitulaire | null,
): VueProfilPP {
  return {
    ...profil.toJSON(),
    prenom: compte?.firstname ?? null,
    nom: compte?.lastname ?? null,
    telephone: compte?.telephone ?? null,
  };
}
