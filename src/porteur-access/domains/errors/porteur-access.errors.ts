/**
 * Erreurs métier de la demande d'accès porteur.
 *
 * TypeScript pur, sur le modèle de `IamError` : aucun import NestJS, aucun
 * statut HTTP. Le domaine dit *ce qui ne va pas métier* (« une demande est
 * déjà en cours », « cette transition n'existe pas ») ; c'est la couche
 * présentation — `PorteurAccessErrorFilter` — qui choisit le statut. Un use
 * case appelé depuis un worker ou un script produirait ainsi la même erreur.
 */

/** Nature métier de l'échec : ce dont la présentation a besoin, rien de plus. */
export enum PorteurAccessErrorKind {
  /** Identité établie mais action non permise (demande d'autrui, rôle inéligible). */
  FORBIDDEN = 'FORBIDDEN',
  /** La demande visée n'existe pas. */
  NOT_FOUND = 'NOT_FOUND',
  /** L'état actuel interdit l'opération (doublon, transition illégale). */
  CONFLICT = 'CONFLICT',
  /** L'entrée fournie est invalide au regard d'une règle métier. */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Trop de demandes sur la période — throttle applicatif, pas réseau. */
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
}

export interface PorteurAccessErrorOptions {
  /** Données structurées additionnelles publiées telles quelles au client. */
  details?: Record<string, unknown>;
}

export abstract class PorteurAccessError extends Error {
  abstract readonly kind: PorteurAccessErrorKind;
  /** Code stable consommé par le front — contrat, pas décoration. */
  abstract readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: PorteurAccessErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.details = options.details;
  }
}

/** Une demande non terminale existe déjà pour ce compte (409). */
export class DemandeAccesPorteurEnCoursError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.CONFLICT;
  readonly code = 'PORTEUR_ACCESS_DEMANDE_EN_COURS';

  constructor() {
    super(
      "Une demande d'accès porteur est déjà en cours d'examen sur votre compte.",
    );
  }
}

/** Le compte dispose déjà de l'accès porteur : la demande n'a plus d'objet (409). */
export class AccesPorteurDejaOuvertError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.CONFLICT;
  readonly code = 'PORTEUR_ACCESS_DEJA_OUVERT';

  constructor() {
    super("L'espace porteur est déjà ouvert sur votre compte.");
  }
}

/** Demande introuvable (404). */
export class DemandeAccesPorteurIntrouvableError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.NOT_FOUND;
  readonly code = 'PORTEUR_ACCESS_DEMANDE_INTROUVABLE';

  constructor() {
    super("Demande d'accès porteur introuvable.");
  }
}

/**
 * Compte introuvable (404).
 *
 * En pratique inatteignable derrière `JwtAuthGuard` — sauf compte supprimé
 * entre l'émission du jeton et l'appel. On préfère un 404 explicite à un
 * déréférencement de `null` deux lignes plus bas.
 */
export class CompteIntrouvableError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.NOT_FOUND;
  readonly code = 'PORTEUR_ACCESS_COMPTE_INTROUVABLE';

  constructor() {
    super('Compte introuvable.');
  }
}

/**
 * Transition non prévue par la machine à états (409).
 *
 * Porte les deux statuts : c'est ce qui permet au back-office d'expliquer un
 * refus d'instruction (« déjà décidée ») sans deviner.
 */
export class TransitionDemandeInterditeError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.CONFLICT;
  readonly code = 'PORTEUR_ACCESS_TRANSITION_INTERDITE';

  constructor(depuis: string, vers: string) {
    super(
      `Transition interdite : une demande « ${depuis} » ne peut pas passer à « ${vers} ».`,
      { details: { statutActuel: depuis, statutDemande: vers } },
    );
  }
}

/**
 * Refuser sans motif CODÉ est interdit : la décision doit être opposable au
 * demandeur, et le motif tiré de la liste fermée (`MotifRefusAccesPorteur`) —
 * jamais d'une rédaction improvisée (400).
 */
export class MotifRefusRequisError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.INVALID_INPUT;
  readonly code = 'PORTEUR_ACCESS_MOTIF_REFUS_REQUIS';

  constructor(
    message = 'Un motif de refus codé, choisi dans la liste fermée, est obligatoire.',
  ) {
    super(message);
  }
}

/**
 * Décision sans auteur humain identifiable (400).
 *
 * Les CGU engagent BeOwn à ne rendre AUCUNE décision entièrement automatisée :
 * une demande acceptée ou refusée porte toujours l'identifiant de
 * l'administrateur qui a tranché. Un `decideurAdminId` absent, nul ou négatif
 * signale un appel qui contourne ce chemin — il est refusé, pas corrigé.
 */
export class DecideurNonImputableError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.INVALID_INPUT;
  readonly code = 'PORTEUR_ACCESS_DECIDEUR_NON_IMPUTABLE';

  constructor() {
    super(
      "Toute décision doit être imputable à un administrateur identifié : aucune décision n'est rendue de façon entièrement automatisée.",
    );
  }
}

/** Motivation absente, trop courte ou trop longue (400). */
export class MotivationInvalideError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.INVALID_INPUT;
  readonly code = 'PORTEUR_ACCESS_MOTIVATION_INVALIDE';

  constructor(message: string) {
    super(message);
  }
}

/** La demande appartient à quelqu'un d'autre — anti-IDOR (403). */
export class DemandeAccesPorteurEtrangereError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.FORBIDDEN;
  readonly code = 'PORTEUR_ACCESS_DEMANDE_ETRANGERE';

  constructor() {
    super("Cette demande n'est pas rattachée à votre compte.");
  }
}

/** Le rôle du compte n'ouvre pas droit à la demande (403). */
export class RoleNonEligibleError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.FORBIDDEN;
  readonly code = 'PORTEUR_ACCESS_ROLE_NON_ELIGIBLE';

  constructor() {
    super("L'accès porteur se demande depuis un compte investisseur.");
  }
}

/**
 * Délai de carence après un refus (429).
 *
 * Throttle **applicatif** : il ne compte pas des requêtes mais des décisions.
 * Le palier HTTP (`@Throttle`) protège l'infrastructure ; celui-ci protège le
 * temps humain de l'équipe qui instruit.
 */
export class DemandeTropRapprocheeError extends PorteurAccessError {
  readonly kind = PorteurAccessErrorKind.TOO_MANY_REQUESTS;
  readonly code = 'PORTEUR_ACCESS_DELAI_CARENCE';

  constructor(reintroductibleLe: Date) {
    super(
      `Votre précédente demande a été refusée. Une nouvelle demande sera recevable à partir du ${reintroductibleLe.toISOString().slice(0, 10)}.`,
      { details: { reintroductibleLe: reintroductibleLe.toISOString() } },
    );
  }
}
