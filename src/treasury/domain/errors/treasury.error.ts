/**
 * Socle des erreurs métier du contexte Treasury — la trésorerie (§3.2, M7).
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§21).
 * Le domaine exprime *ce qui ne va pas métier* (« le solde ne couvre pas ce
 * mouvement », « ce portefeuille est gelé ») ; c'est la couche présentation —
 * `TreasuryErrorFilter` — qui traduit en réponse HTTP, et qui porte seule la
 * correspondance avec les codes de l'Annexe B du cahier des charges
 * (`WALLET_INSUFFICIENT`, `WALLET_FROZEN`).
 *
 * Les contextes Reservation, Subscription, Catalog, Compliance et IAM portent
 * le même socle. Ce doublon est assumé : partager une classe de base
 * obligerait chaque Bounded Context à dépendre d'un module commun qui
 * grossirait à chaque nouveau besoin — précisément ce que §25 demande d'éviter.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum TreasuryErrorKind {
  /** Identité établie mais action non permise. */
  FORBIDDEN = 'FORBIDDEN',
  /** La ressource visée n'existe pas. */
  NOT_FOUND = 'NOT_FOUND',
  /** L'état actuel interdit l'opération (portefeuille gelé, mouvement rejoué). */
  CONFLICT = 'CONFLICT',
  /** L'entrée fournie est invalide au regard d'une règle métier. */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Défaillance d'une dépendance : rien à corriger côté appelant. */
  UNEXPECTED = 'UNEXPECTED',
}

export interface TreasuryErrorOptions {
  /** Code stable consommé par le front (Annexe B). Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. le solde disponible). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class TreasuryError extends Error {
  abstract readonly kind: TreasuryErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: TreasuryErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
