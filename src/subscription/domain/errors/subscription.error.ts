/**
 * Socle des erreurs métier du contexte Subscription — la souscription
 * obligataire (§3.2, M6).
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§21).
 * Le domaine exprime *ce qui ne va pas métier* (« le délai de rétractation est
 * dépassé », « il ne reste plus de fractions ») ; c'est la couche présentation
 * — `SubscriptionErrorFilter` — qui traduit en réponse HTTP, et qui porte
 * seule la correspondance avec les codes de l'Annexe B du cahier des charges
 * (`TICKET_ABOVE_MAX`, `WALLET_INSUFFICIENT`…).
 *
 * Les contextes Reservation (`ReservationError`), Catalog (`CatalogError`),
 * Compliance (`ComplianceError`) et IAM (`IamError`) portent le même socle. Ce
 * doublon est assumé : partager une classe de base obligerait chaque Bounded
 * Context à dépendre d'un module commun qui grossirait à chaque nouveau
 * besoin — précisément ce que §25 demande d'éviter.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum SubscriptionErrorKind {
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

export interface SubscriptionErrorOptions {
  /** Code stable consommé par le front (Annexe B). Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. la borne franchie). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class SubscriptionError extends Error {
  abstract readonly kind: SubscriptionErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: SubscriptionErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
