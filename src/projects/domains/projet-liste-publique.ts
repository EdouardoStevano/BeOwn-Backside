/**
 * Projection « liste » d'un projet : ce que les cartes affichent, sans les
 * sections rédigées du dossier.
 *
 * ─── Le constat (A6, mesure de charge) ──────────────────────────────────────
 * `GET /projects/public` renvoyait environ 25 Ko pour QUATRE projets. Le
 * coupable n'est pas le nombre de champs mais trois d'entre eux, tous longs et
 * tous inutiles à une carte :
 *   - `fici`   : le document d'informations clés complet, ~2,4 Ko par projet ;
 *   - `descriptionMd` : la présentation rédigée, en Markdown ;
 *   - `previsionnel`  : le plan financier détaillé.
 * Ils sont servis en même temps que le détail du projet, où ils ont leur
 * place : `GET /projects/:id`, `/projects/slug/:slug`, `/:id/investor-view`
 * les conservent intégralement.
 *
 * ─── Vérification côté consommateur ─────────────────────────────────────────
 * Relecture des deux seules chaînes qui consomment la liste dans le Frontside
 * (`features/landing/hooks/usePublicProjects.ts` → `PropertyCard`, et
 * `features/dashboard/store/project.store.ts` → cartes du tableau de bord) :
 *   - `fici` et `previsionnel` : AUCUNE occurrence, ces champs ne sont même
 *     pas déclarés dans le type `BackendProject` du front ;
 *   - `descriptionMd` : lu à un seul endroit (`usePublicProjects.ts`, mappé
 *     vers `Property.description`) et cette valeur n'est rendue par AUCUN
 *     composant. Le champ étant optionnel côté front, son absence donne une
 *     chaîne vide et ne change rien à l'écran.
 * Tous les autres champs consommés par les cartes (titre, ville, pays, type,
 * statut, images, capitalCible, ticketMinimum, triCible, dureeMois,
 * dateOuvertureCollecte, fractions, stats…) restent servis.
 */

/** Champs du dossier projet qui n'ont pas leur place dans une liste. */
export const CHAMPS_HORS_LISTE = [
  'fici',
  'descriptionMd',
  'previsionnel',
] as const;

export type ChampHorsListe = (typeof CHAMPS_HORS_LISTE)[number];

/**
 * Retire les sections lourdes d'un projet destiné à une LISTE. Fonction pure :
 * l'objet d'entrée n'est pas modifié.
 */
export function projeterProjetPourListe<T extends object>(
  projet: T,
): Omit<T, ChampHorsListe> {
  const allege = { ...projet } as Record<string, unknown>;
  for (const champ of CHAMPS_HORS_LISTE) {
    delete allege[champ];
  }
  return allege as Omit<T, ChampHorsListe>;
}
