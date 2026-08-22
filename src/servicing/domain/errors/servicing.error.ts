/**
 * Socle des erreurs métier du contexte Servicing — la vie de l'obligation
 * après la signature : échéancier, coupons, retenue à la source, défauts
 * (§3.2, M8).
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§21).
 * Le domaine exprime *ce qui ne va pas métier* (« cette échéance n'est pas
 * payable », « cet échéancier est impossible à générer ») ; c'est
 * `ServicingErrorFilter` qui traduit en réponse HTTP.
 *
 * Les contextes Subscription (`SubscriptionError`), Reservation, Catalog,
 * Compliance, Treasury et IAM portent le même socle. Ce doublon est assumé :
 * partager une classe de base obligerait chaque Bounded Context à dépendre
 * d'un module commun qui grossirait à chaque nouveau besoin — précisément ce
 * que §25 demande d'éviter.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum ServicingErrorKind {
  /** Identité établie mais action non permise. */
  FORBIDDEN = 'FORBIDDEN',
  /** La ressource visée n'existe pas. */
  NOT_FOUND = 'NOT_FOUND',
  /** L'état actuel interdit l'opération (transition impossible). */
  CONFLICT = 'CONFLICT',
  /** L'entrée fournie est invalide au regard d'une règle métier. */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Défaillance d'une dépendance : rien à corriger côté appelant. */
  UNEXPECTED = 'UNEXPECTED',
}

export interface ServicingErrorOptions {
  /** Code stable consommé par le front (Annexe B). Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. le statut qui bloque). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class ServicingError extends Error {
  abstract readonly kind: ServicingErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ServicingErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
