import {
  ProfilPP,
  ProfilPPSnapshot,
} from 'src/compliance/domain/aggregates/profil-pp';
import { ClassementPsfp } from 'src/compliance/domain/value-objects/classement-psfp.vo';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';

/**
 * Ce que le contexte Profiles lit du compte, dans le vocabulaire d'IAM.
 *
 * Un type structurel plutôt que `User` : le dossier n'a besoin que de deux
 * lectures, et les nommer ici dit exactement ce qu'il emprunte au contexte
 * voisin — le reste de l'agrégat (rôle, statut, empreinte du mot de passe) ne
 * le regarde pas.
 */
export interface CompteDuTitulaire {
  firstname: string | null;
  lastname: string | null;
}

/** L'état civil, dans le vocabulaire du dossier — celui que le front lit. */
export interface EtatCivilPublie {
  prenom: string | null;
  nom: string | null;
}

/**
 * Le classement PSFP, publié à côté du dossier sans lui appartenir.
 *
 * Ces trois clés étaient des colonnes de `profil_pp`. Elles n'y étaient qu'une
 * **copie** de ce que le questionnaire d'adéquation calcule, et une personne
 * morale — qui n'a pas de profil PP — n'était donc classée nulle part. La
 * source est `InvestorComplianceProfile` ; la réponse, elle, ne change pas.
 */
export interface ClassementPublie {
  categoriePsfp: CategoriePsfp;
  patrimoineDeclare: number | null;
  montantMaxConseille: number | null;
}

/**
 * Ce que publient les routes du profil personne physique : le dossier, plus
 * l'état civil que porte le compte. Le téléphone, lui, est dans le dossier —
 * il arrive donc par `profil.toJSON()`, sans composition.
 *
 * Deux identifiants, et ils ne disent pas la même chose : `id` est celui du
 * dossier, `userId` celui de son titulaire. Le second s'appelait
 * `utilisateurId` — le dossier nomme sa référence au compte dans sa propre
 * langue à l'intérieur du contexte (§4), mais à la sortie l'API n'en a qu'une,
 * et c'est celle qu'`identity` a posée : le même entier s'appelle `userId`
 * dans le token, dans `GET /users/me` et dans toutes les routes qui en
 * dépendent. Deux noms pour un identifiant, c'est un front qui finit par
 * croire à deux identifiants.
 */
export type VueProfilPP = ProfilPPSnapshot & EtatCivilPublie & ClassementPublie;

/**
 * Recompose la vue attendue par le front à partir des deux propriétaires.
 *
 * `prenom` et `nom` ont quitté la table `profil_pp` pour `user`, qui les
 * portait déjà. Les retirer de la réponse aurait cassé l'écran de profil,
 * alors qu'ils y restent parfaitement légitimes pour qui la consomme : **une
 * seule source, deux lectures**. La composition se fait ici, une fois, plutôt
 * que dans chacune des trois routes — et la traduction de vocabulaire
 * (`firstname` → `prenom`) avec elle.
 *
 * `null` plutôt qu'absent quand le compte n'a rien : le front distingue « pas
 * de nom de famille » de « champ disparu de l'API ».
 */
export function vueProfilPP(
  profil: ProfilPP,
  compte: CompteDuTitulaire | null,
  classement: ClassementPsfp | null,
): VueProfilPP {
  return {
    ...profil.toJSON(),
    prenom: compte?.firstname ?? null,
    nom: compte?.lastname ?? null,
    // Sans questionnaire, le titulaire **est** non averti : le classement se
    // gagne, il ne se présume pas. Le repli est celui de la racine — le même
    // objet, et non trois valeurs par défaut réécrites clé par clé, qui
    // pouvaient diverger du domaine sans que rien ne le signale.
    ...(classement ?? ClassementPsfp.initial()).toSnapshot(),
  };
}
