import { Avis } from './avis';

/**
 * Un avis tel qu'il peut être PUBLIÉ.
 *
 * `GET /avis/projet/:projetId` et `GET /projects/:id/avis` sont deux routes
 * `@Public()` qui renvoyaient l'avis tel qu'il sort du dépôt : `userId`, prénom
 * ET nom complet de l'auteur. Croisée avec la fiche projet, la liste disait
 * publiquement qui s'intéresse — souvent qui a investi — dans quel bien, sous
 * une identité nominative que personne n'a consenti à publier.
 *
 * L'auteur est réduit à son prénom et à l'initiale de son nom, comme la
 * plateforme le fait déjà pour l'acheteur montré au vendeur au marché
 * secondaire (`AcheteurMinimalDto`) : de quoi donner corps à un avis, pas de
 * quoi désigner une personne.
 *
 * Fonction PURE, dans le domaine : c'est le domaine qui décide de ce qui est
 * publiable, et les deux contrôleurs qui l'appliquent — un seul endroit à
 * corriger, aucune divergence possible entre les deux routes.
 */
export interface AuteurAvisPublic {
  prenom: string;
  initialeNom: string;
}

export interface AvisPublic {
  id: string;
  note: number;
  commentaire: string | null;
  createdAt: Date;
  auteur: AuteurAvisPublic;
}

const PRENOM_PAR_DEFAUT = 'Investisseur';

export const projeterAvisPublic = (avis: Avis): AvisPublic => ({
  id: avis.id,
  note: avis.note,
  commentaire: avis.commentaire,
  createdAt: avis.createdAt,
  auteur: {
    prenom: avis.userFirstname?.trim() || PRENOM_PAR_DEFAUT,
    initialeNom: avis.userLastname?.trim()
      ? `${avis.userLastname.trim().charAt(0).toUpperCase()}.`
      : '',
  },
});

export const projeterAvisPublics = (avis: Avis[]): AvisPublic[] =>
  avis.map(projeterAvisPublic);
