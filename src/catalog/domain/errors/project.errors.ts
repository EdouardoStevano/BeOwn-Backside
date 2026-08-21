import { ProjectStatus } from '../enums/project-status.enum';
import { CatalogError, CatalogErrorKind } from './catalog.error';

/**
 * Le projet visé n'existe pas — ou n'est pas visible depuis ce point d'entrée.
 *
 * Le second cas est délibérément indistinguable du premier : un brouillon
 * consulté par son slug (dérivé du titre, donc devinable) doit répondre comme
 * un projet inexistant, faute de quoi le slug devient un oracle d'existence.
 * Le message est repris mot pour mot des `NotFoundException` qu'il remplace.
 */
export class ProjetIntrouvableError extends CatalogError {
  readonly kind = CatalogErrorKind.NOT_FOUND;

  constructor() {
    super('Projet introuvable.', { code: 'PROJET_INTROUVABLE' });
  }
}

/**
 * Deux projets ne peuvent pas porter le même slug.
 *
 * Le slug est l'adresse publique du projet (`/p/:slug`) et la colonne est
 * `unique` : sans ce contrôle, la création remonterait une violation de
 * contrainte Postgres brute, en 500.
 */
export class SlugProjetDejaPrisError extends CatalogError {
  readonly kind = CatalogErrorKind.CONFLICT;

  constructor(slug: string) {
    super('Un projet avec ce slug existe déjà.', {
      code: 'SLUG_PROJET_DEJA_PRIS',
      details: { slug },
    });
  }
}

/**
 * Transition de statut hors du cycle de vie du projet.
 *
 * La table des transitions autorisées vit dans {@link StatutProjet} : c'est du
 * métier pur, et elle était jusqu'ici une constante de module dans
 * `UpdateProjectStatusUseCase` — donc inaccessible à tout autre chemin
 * d'écriture (l'exécution d'une sortie, par exemple, forçait `CLOTURE` sans
 * jamais consulter la table).
 */
export class TransitionStatutProjetInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(actuel: ProjectStatus, vise: ProjectStatus) {
    super(`Transition invalide de ${actuel} vers ${vise}.`, {
      code: 'TRANSITION_STATUT_PROJET_INVALIDE',
      details: { statutActuel: actuel, statutVise: vise },
    });
  }
}

/**
 * Un champ du projet ne respecte pas sa règle métier.
 *
 * Levée par les Value Objects du projet ({@link Localisation},
 * {@link ConditionsFinancieres}, {@link CalendrierProjet}), qui s'auto-valident
 * à la construction. Le DTO valide déjà la *forme* de l'entrée HTTP ; ces
 * règles-ci sont du métier, et tiennent quel que soit le point d'entrée.
 */
export class ChampProjetInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(champ: string, raison: string) {
    super(`Champ « ${champ} » invalide : ${raison}`, {
      code: 'CHAMP_PROJET_INVALIDE',
      details: { champ },
    });
  }
}

/**
 * Le lien de partage ne désigne aucun projet ouvert aux investisseurs.
 *
 * Un jeton illisible, périmé, ou pointant vers un projet qui n'est plus en
 * collecte donne la même réponse : le partage ne doit rien révéler du
 * catalogue.
 */
export class LienPartageInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.NOT_FOUND;

  constructor() {
    super('Lien de partage invalide ou projet introuvable.', {
      code: 'LIEN_PARTAGE_INVALIDE',
    });
  }
}
