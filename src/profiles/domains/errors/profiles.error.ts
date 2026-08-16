/**
 * Socle des erreurs métier du contexte Profiles.
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§12.1).
 * Le domaine exprime *ce qui ne va pas métier* (« la date de naissance est
 * dans le futur », « le profil existe déjà ») ; c'est la couche présentation —
 * `ProfilesErrorFilter` — qui traduit en réponse HTTP.
 *
 * Le contexte IAM porte le même socle (`IamError`). Ce doublon est assumé :
 * partager une classe de base obligerait chaque Bounded Context à dépendre
 * d'un module commun qui grossirait à chaque nouveau besoin — précisément ce
 * que CRP (§5) demande d'éviter. Quarante lignes recopiées coûtent moins cher
 * qu'un couplage entre contextes.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité :
 * c'est ce dont la présentation a besoin pour choisir un statut, sans que le
 * domaine ait à connaître les codes HTTP.
 */
export enum ProfilesErrorKind {
  /** Identité établie mais action non permise. */
  FORBIDDEN = 'FORBIDDEN',
  /** La ressource visée n'existe pas. */
  NOT_FOUND = 'NOT_FOUND',
  /** L'état actuel interdit l'opération (doublon, transition impossible). */
  CONFLICT = 'CONFLICT',
  /** L'entrée fournie est invalide au regard d'une règle métier. */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Défaillance d'une dépendance : rien à corriger côté appelant. */
  UNEXPECTED = 'UNEXPECTED',
}

export interface ProfilesErrorOptions {
  /** Code stable consommé par le front. Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. le champ fautif). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class ProfilesError extends Error {
  abstract readonly kind: ProfilesErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ProfilesErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
