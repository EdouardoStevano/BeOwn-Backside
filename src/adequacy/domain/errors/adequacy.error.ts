/**
 * Socle des erreurs métier du contexte **Adéquation & profil de risque**.
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP. Le
 * domaine exprime *ce qui ne va pas métier* (« cette étape du questionnaire
 * n'est pas ouverte ») ; c'est la couche présentation qui traduit en réponse
 * HTTP (§21).
 *
 * **Ce socle est un doublon de celui de l'entrée en relation, et c'est
 * assumé.** C'est déjà le cas entre Reservation, Subscription, Catalog,
 * Treasury et IAM, chacun portant le sien pour la raison que §25 donne :
 * partager une classe de base obligerait chaque Bounded Context à dépendre d'un
 * module commun qui grossirait à chaque nouveau besoin. Le doublon coûte
 * quarante lignes ; la dépendance coûterait une frontière.
 *
 * Les cinq `kind` sont ceux de tous les autres contextes — la présentation les
 * traduit de la même façon, et une correspondance qui diffère d'un contexte à
 * l'autre serait une source d'erreur pour le front.
 */

/**
 * Nature métier de l'échec. Volontairement à ce niveau de granularité : c'est
 * ce dont la présentation a besoin pour choisir un statut, sans que le domaine
 * ait à connaître les codes HTTP.
 */
export enum AdequacyErrorKind {
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

export interface AdequacyErrorOptions {
  /** Code stable consommé par le front. Absent = pas de contrat de code. */
  code?: string;
  /** Données structurées additionnelles (ex. l'étape demandée). */
  details?: Record<string, unknown>;
  /** Erreur d'origine, conservée pour les logs. */
  cause?: unknown;
}

export abstract class AdequacyError extends Error {
  abstract readonly kind: AdequacyErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: AdequacyErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
