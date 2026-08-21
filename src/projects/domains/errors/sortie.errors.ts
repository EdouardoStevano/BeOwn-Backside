import { ModeleEconomique } from '../enums/modele-economique.enum';
import { ProjectStatus } from '../enums/project-status.enum';
import { StatutSortie } from '../enums/statut-sortie.enum';
import { ProjectsError, ProjectsErrorKind } from './projects.error';

/** La sortie visée n'existe pas. */
export class SortieIntrouvableError extends ProjectsError {
  readonly kind = ProjectsErrorKind.NOT_FOUND;

  constructor() {
    super('Sortie introuvable.', { code: 'SORTIE_INTROUVABLE' });
  }
}

/**
 * Une sortie ne se déclare que sur un projet en equity.
 *
 * Une sortie, c'est la revente du bien détenu par la SCI puis la distribution
 * de la plus-value aux porteurs de parts. Un projet obligataire ne détient
 * rien : il rembourse un principal et des intérêts selon un échéancier, ce que
 * fait le contexte Investments.
 */
export class ModeleEconomiqueNonEquityError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor(actuel: ModeleEconomique) {
    super(
      `Sortie disponible uniquement pour modèle EQUITY (actuel: ${actuel}).`,
      { code: 'MODELE_ECONOMIQUE_NON_EQUITY', details: { modele: actuel } },
    );
  }
}

/**
 * Une sortie ne se déclare que sur un projet financé.
 *
 * Avant `FINANCE`, le bien n'est pas acquis : il n'y a rien à revendre, et
 * `capitalCible` ne représente pas encore un capital réellement collecté.
 */
export class ProjetNonFinanceError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor(actuel: ProjectStatus) {
    super(`Projet doit être en statut FINANCE (actuel: ${actuel}).`, {
      code: 'PROJET_NON_FINANCE',
      details: { statut: actuel },
    });
  }
}

/**
 * Un projet ne se revend qu'une fois.
 *
 * Toute sortie non annulée bloque la déclaration d'une suivante : deux sorties
 * vivantes sur le même projet distribueraient deux fois le même capital.
 */
export class SortieDejaEnCoursError extends ProjectsError {
  readonly kind = ProjectsErrorKind.CONFLICT;

  constructor(statutExistant: StatutSortie) {
    super(
      `Une sortie existe déjà pour ce projet (statut: ${statutExistant}).`,
      {
        code: 'SORTIE_DEJA_EN_COURS',
        details: { statutExistant },
      },
    );
  }
}

/**
 * Transition hors du cycle de vie d'une sortie.
 *
 * Le cycle — `PROJETEE → ACTEE → DISTRIBUEE`, avec `ANNULEE` accessible tant
 * que rien n'a été versé — était jusqu'ici épelé à trois endroits : deux
 * `if` dans `AdminSortiesController` (qui mutait `sortie.statut` directement,
 * §12.5) et un troisième dans `ExecuteSortieUseCase`.
 */
export class TransitionSortieInvalideError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor(actuel: StatutSortie, attendu: StatutSortie, vise: StatutSortie) {
    super(`Statut actuel "${actuel}" — seul ${attendu} peut être ${vise}.`, {
      code: 'TRANSITION_SORTIE_INVALIDE',
      details: { statutActuel: actuel, statutVise: vise },
    });
  }
}

/** Le capital versé ne se reprend pas : une sortie distribuée est définitive. */
export class SortieDejaDistribueeError extends ProjectsError {
  readonly kind = ProjectsErrorKind.CONFLICT;

  constructor() {
    super('Sortie déjà distribuée, annulation impossible.', {
      code: 'SORTIE_DEJA_DISTRIBUEE',
    });
  }
}

/**
 * Le capital cible du projet ne permet pas de calculer les quotes-parts.
 *
 * La part de plus-value d'un investisseur vaut `montant / capitalCible` : un
 * capital cible nul ou négatif rendrait la division absurde, et distribuerait
 * n'importe quoi.
 */
export class CapitalCibleInexploitableError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor() {
    super('capitalCible du projet invalide.', {
      code: 'CAPITAL_CIBLE_INEXPLOITABLE',
    });
  }
}

/** Un champ de la sortie ne respecte pas sa règle métier. */
export class ChampSortieInvalideError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor(champ: string, raison: string) {
    super(`Champ « ${champ} » invalide : ${raison}`, {
      code: 'CHAMP_SORTIE_INVALIDE',
      details: { champ },
    });
  }
}
