/**
 * Socle des erreurs métier du contexte KYC.
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§12.1).
 * Le domaine exprime *ce qui ne va pas métier* (« ce dossier n'est pas en revue
 * manuelle ») ; c'est la couche présentation — `KycErrorFilter` — qui traduit
 * en réponse HTTP.
 *
 * Les contextes Profiles (`ProfilesError`) et IAM (`IamError`) portent le même
 * socle. Ce doublon est assumé, et pour la raison que `profiles.error.ts`
 * énonce déjà : partager une classe de base obligerait chaque Bounded Context à
 * dépendre d'un module commun qui grossirait à chaque nouveau besoin —
 * précisément ce que CRP (§5) demande d'éviter.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum KycErrorKind {
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

export interface KycErrorOptions {
  /** Code stable consommé par le front. Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. le champ fautif). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class KycError extends Error {
  abstract readonly kind: KycErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: KycErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
