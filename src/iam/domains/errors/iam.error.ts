/**
 * Socle des erreurs métier du contexte IAM.
 *
 * Ces classes sont du TypeScript pur : aucun import NestJS, aucune notion de
 * statut HTTP (§12.1). Un use case exprime *ce qui ne va pas métier*
 * (« identifiants invalides », « compte suspendu ») ; c'est la couche
 * présentation — `IamErrorFilter` — qui traduit en réponse HTTP. Avant, les
 * use cases levaient directement des `UnauthorizedException` : la couche
 * applicative connaissait le protocole de transport, et le même use case
 * appelé depuis un worker ou un job cron aurait produit une erreur HTTP.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité :
 * c'est ce dont la présentation a besoin pour choisir un statut, sans que le
 * domaine ait à connaître les codes HTTP.
 */
export enum IamErrorKind {
  /** Identité non établie ou preuve invalide (token, mot de passe, OTP). */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /** Identité établie mais action non permise. */
  FORBIDDEN = 'FORBIDDEN',
  /** La ressource visée n'existe pas. */
  NOT_FOUND = 'NOT_FOUND',
  /** L'état actuel interdit l'opération (doublon, blocage). */
  CONFLICT = 'CONFLICT',
  /** L'entrée fournie est invalide au regard d'une règle métier. */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Défaillance d'une dépendance : rien à corriger côté appelant. */
  UNEXPECTED = 'UNEXPECTED',
}

export interface IamErrorOptions {
  /** Code stable consommé par le front. Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. la liste des bloqueurs). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class IamError extends Error {
  abstract readonly kind: IamErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: IamErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
