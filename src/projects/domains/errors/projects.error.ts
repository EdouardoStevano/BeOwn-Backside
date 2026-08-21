/**
 * Socle des erreurs métier du contexte Projects.
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§12.1).
 * Le domaine exprime *ce qui ne va pas métier* (« ce projet n'est pas financé »,
 * « cette transition de statut n'existe pas ») ; c'est la couche présentation —
 * `ProjectsErrorFilter` — qui traduit en réponse HTTP.
 *
 * Les contextes KYC (`KycError`), Profiles (`IamError`) et IAM (`IamError`)
 * portent le même socle. Ce doublon est assumé, et pour la raison que
 * `kyc.error.ts` énonce déjà : partager une classe de base obligerait chaque
 * Bounded Context à dépendre d'un module commun qui grossirait à chaque nouveau
 * besoin — précisément ce que CRP (§5) demande d'éviter.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum ProjectsErrorKind {
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

export interface ProjectsErrorOptions {
  /** Code stable consommé par le front. Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. le champ fautif). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class ProjectsError extends Error {
  abstract readonly kind: ProjectsErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ProjectsErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
