import { ProjectStatus } from '../enums/project-status.enum';
import { TransitionStatutProjetInvalideError } from '../errors/project.errors';

/**
 * Cycle de vie du projet.
 *
 * ```
 * BROUILLON ─▶ ANNONCE ─┬─▶ PRE_INVESTISSEMENT ─▶ EN_COLLECTE ─┬─▶ FINANCE ─▶ EN_EXPLOITATION ─▶ CLOTURE
 *                       └─────────────────────────▶            └─▶ ECHEC
 * ```
 *
 * `ANNULE` est accessible tant qu'aucun capital n'a été collecté, et depuis
 * l'exploitation. `CLOTURE`, `ECHEC` et `ANNULE` sont terminaux.
 *
 * La table vivait en constante de module dans `UpdateProjectStatusUseCase` :
 * du métier dans la couche applicative, et surtout une règle qu'un seul chemin
 * d'écriture consultait. `ExecuteSortieUseCase` forçait `CLOTURE` sans la
 * croiser — sur un projet resté `FINANCE`, il opérait donc une transition que
 * cette table n'autorise pas. Ce chemin existe pour de bonnes raisons (revendre
 * le bien clôture l'opération, exploitation ou pas) : il garde le sien,
 * {@link cloturerApresSortie}, plutôt que d'élargir la table — ce qui
 * ouvrirait à l'admin un `FINANCE → CLOTURE` direct qu'il n'a jamais eu.
 */
const TRANSITIONS_AUTORISEES: Readonly<
  Record<ProjectStatus, readonly ProjectStatus[]>
> = {
  [ProjectStatus.BROUILLON]: [ProjectStatus.ANNONCE, ProjectStatus.ANNULE],
  [ProjectStatus.ANNONCE]: [
    ProjectStatus.PRE_INVESTISSEMENT,
    ProjectStatus.EN_COLLECTE,
    ProjectStatus.ANNULE,
  ],
  [ProjectStatus.PRE_INVESTISSEMENT]: [
    ProjectStatus.EN_COLLECTE,
    ProjectStatus.ANNULE,
  ],
  [ProjectStatus.EN_COLLECTE]: [ProjectStatus.FINANCE, ProjectStatus.ECHEC],
  [ProjectStatus.FINANCE]: [ProjectStatus.EN_EXPLOITATION],
  [ProjectStatus.EN_EXPLOITATION]: [
    ProjectStatus.CLOTURE,
    ProjectStatus.ANNULE,
  ],
  [ProjectStatus.CLOTURE]: [],
  [ProjectStatus.ECHEC]: [],
  [ProjectStatus.ANNULE]: [],
};

/**
 * Statuts ouverts aux investisseurs sur le site public.
 *
 * La liste était réécrite à quatre endroits de `ProjectController` — la liste
 * publique, la résolution d'un lien de partage et les deux routes d'avis — et
 * pas toujours à l'identique : la liste publique incluait `ANNONCE`, les trois
 * autres non. Une seule liste désormais, celle qui gouverne la visibilité.
 */
const STATUTS_PUBLICS: readonly ProjectStatus[] = [
  ProjectStatus.ANNONCE,
  ProjectStatus.PRE_INVESTISSEMENT,
  ProjectStatus.EN_COLLECTE,
  ProjectStatus.FINANCE,
];

/**
 * Statuts sur lesquels un projet est **investissable** : la collecte y est
 * ouverte ou close, mais le dossier a dépassé le stade de l'annonce.
 *
 * C'est la liste qu'utilisaient le partage et les avis. Elle reste distincte
 * de {@link STATUTS_PUBLICS} : un projet en simple annonce est consultable sans
 * qu'on doive pouvoir en débattre ni le partager comme une offre.
 */
const STATUTS_OUVERTS_AUX_INVESTISSEURS: readonly ProjectStatus[] = [
  ProjectStatus.PRE_INVESTISSEMENT,
  ProjectStatus.EN_COLLECTE,
  ProjectStatus.FINANCE,
];

/** Où en est le projet, et où il a le droit d'aller ensuite. */
export class StatutProjet {
  private constructor(readonly valeur: ProjectStatus) {}

  /** Tout projet naît brouillon — voir {@link ProjectFactory}. */
  static initial(): StatutProjet {
    return new StatutProjet(ProjectStatus.BROUILLON);
  }

  static restore(statut: ProjectStatus): StatutProjet {
    return new StatutProjet(statut);
  }

  /** Statuts visibles sans être authentifié. */
  static get statutsPublics(): readonly ProjectStatus[] {
    return STATUTS_PUBLICS;
  }

  /** Statuts sur lesquels un investisseur peut agir (partage, avis). */
  static get statutsOuvertsAuxInvestisseurs(): readonly ProjectStatus[] {
    return STATUTS_OUVERTS_AUX_INVESTISSEURS;
  }

  peutAllerVers(vise: ProjectStatus): boolean {
    return TRANSITIONS_AUTORISEES[this.valeur].includes(vise);
  }

  /**
   * Statut suivant, ou {@link TransitionStatutProjetInvalideError}.
   *
   * Une transition vers le statut courant est refusée comme les autres : la
   * table ne se liste jamais elle-même, et rejouer un passage en collecte
   * relancerait la diffusion « nouveau projet ».
   */
  allerVers(vise: ProjectStatus): StatutProjet {
    if (!this.peutAllerVers(vise)) {
      throw new TransitionStatutProjetInvalideError(this.valeur, vise);
    }
    return new StatutProjet(vise);
  }

  /**
   * Clôture consécutive à une sortie : le bien est vendu, le capital et la
   * plus-value ont été versés, l'opération n'a plus d'objet.
   *
   * Le seul chemin qui court-circuite {@link allerVers}, et il est nommé pour
   * qu'on le voie. Ouvert depuis `FINANCE` — où l'exécution d'une sortie l'a
   * toujours emmené — et depuis `EN_EXPLOITATION`, où la table le permet déjà.
   */
  cloturerApresSortie(): StatutProjet {
    if (
      this.valeur !== ProjectStatus.FINANCE &&
      this.valeur !== ProjectStatus.EN_EXPLOITATION
    ) {
      throw new TransitionStatutProjetInvalideError(
        this.valeur,
        ProjectStatus.CLOTURE,
      );
    }
    return new StatutProjet(ProjectStatus.CLOTURE);
  }

  /** Un brouillon n'est ni listé, ni consultable par son slug. */
  get estBrouillon(): boolean {
    return this.valeur === ProjectStatus.BROUILLON;
  }

  get estPublic(): boolean {
    return STATUTS_PUBLICS.includes(this.valeur);
  }

  get estOuvertAuxInvestisseurs(): boolean {
    return STATUTS_OUVERTS_AUX_INVESTISSEURS.includes(this.valeur);
  }
}
