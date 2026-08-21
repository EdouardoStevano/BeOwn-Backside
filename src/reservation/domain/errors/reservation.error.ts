/**
 * Socle des erreurs métier du contexte Reservation — le Core Domain (§3.1).
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§21).
 * Le domaine exprime *ce qui ne va pas métier* (« le plafond de
 * pré-investissement est atteint », « cette réservation est déjà convertie ») ;
 * c'est la couche présentation — `ReservationErrorFilter` — qui traduit en
 * réponse HTTP, et qui porte seule la correspondance avec les codes de
 * l'Annexe B du cahier des charges (`RESERVATION_FULL`, `PROJECT_NOT_OPEN`…).
 *
 * Les contextes Catalog (`CatalogError`), Compliance (`ComplianceError`) et
 * IAM (`IamError`) portent le même socle. Ce doublon est assumé : partager une
 * classe de base obligerait chaque Bounded Context à dépendre d'un module
 * commun qui grossirait à chaque nouveau besoin — précisément ce que CRP (§5)
 * demande d'éviter.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum ReservationErrorKind {
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

export interface ReservationErrorOptions {
  /** Code stable consommé par le front (Annexe B). Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. la borne franchie). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class ReservationError extends Error {
  abstract readonly kind: ReservationErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ReservationErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
