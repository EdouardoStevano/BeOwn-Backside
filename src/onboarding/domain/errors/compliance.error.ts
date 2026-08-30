/**
 * Socle des erreurs métier du contexte Compliance.
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP. Le
 * domaine exprime *ce qui ne va pas métier* (« ce dossier n'est pas en revue
 * manuelle », « la date de naissance est dans le futur ») ; c'est la couche
 * présentation — `ComplianceErrorFilter` — qui traduit en réponse HTTP (§21).
 *
 * Il naît de la fusion de deux socles identiques : `ComplianceError`, qui vivait dans
 * `src/kyc/`, et `ProfilesError`, passé un temps par `IamError` lors du repli
 * de `src/profiles/`. Les recopier se justifiait tant que les deux moitiés
 * étaient des contextes distincts (CRP, §5) ; une fois réunies dans
 * `compliance`, le doublon n'a plus d'argument — un contexte n'a qu'un
 * vocabulaire d'erreurs.
 *
 * Les cinq `kind` couvrent l'union exacte des deux : ni l'un ni l'autre
 * n'exprimait d'`UNAUTHENTICATED` — établir l'identité de l'appelant est
 * l'affaire d'`identity`, pas la nôtre.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum ComplianceErrorKind {
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

export interface ComplianceErrorOptions {
  /** Code stable consommé par le front. Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. le champ fautif). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class ComplianceError extends Error {
  abstract readonly kind: ComplianceErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ComplianceErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
