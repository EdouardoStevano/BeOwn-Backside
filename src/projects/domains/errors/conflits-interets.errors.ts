/**
 * Erreurs métier des conflits d'intérêts porteur/investisseur.
 *
 * TypeScript pur, sur le modèle de `PorteurAccessError` : aucun import NestJS,
 * aucun statut HTTP. Le domaine dit *ce qui ne va pas métier* (« vous portez ce
 * projet », « vous en détenez déjà des parts ») ; c'est la couche présentation
 * — `ConflitsInteretsErrorFilter` — qui choisit le statut. La même règle
 * appelée depuis un worker ou un script produirait ainsi la même erreur.
 */

/** Nature métier de l'échec : ce dont la présentation a besoin, rien de plus. */
export enum ConflitsInteretsErrorKind {
  /** Identité établie mais opération interdite à cette personne (403). */
  FORBIDDEN = 'FORBIDDEN',
  /** L'état existant interdit l'opération — détention déjà constituée (409). */
  CONFLICT = 'CONFLICT',
}

export interface ConflitsInteretsErrorOptions {
  /** Données structurées additionnelles publiées telles quelles au client. */
  details?: Record<string, unknown>;
}

export abstract class ConflitsInteretsError extends Error {
  abstract readonly kind: ConflitsInteretsErrorKind;
  /** Code stable consommé par le front — contrat, pas décoration. */
  abstract readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ConflitsInteretsErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.details = options.details;
  }
}

/**
 * Le porteur du projet tente d'y engager de l'argent (403).
 *
 * Sept portes d'entrée, une seule erreur : souscription directe, souscription
 * signée, ajout de fractions, réservation, marque d'intérêt, acceptation de
 * cession et initiation d'achat renvoient toutes ce code. Le front n'a donc
 * qu'un cas à traiter, et le message reste le même quel que soit le chemin.
 *
 * Le message ne révèle rien que le destinataire ne sache déjà : il est le
 * porteur du projet qu'il vise. Aucune mention du mécanisme de contrôle, aucune
 * donnée sur d'autres comptes.
 */
export class PorteurDeSonPropreProjetError extends ConflitsInteretsError {
  readonly kind = ConflitsInteretsErrorKind.FORBIDDEN;
  readonly code = 'CONFLIT_INTERETS_PORTEUR_DU_PROJET';

  constructor(motif: string) {
    super(motif);
  }
}

/**
 * Réciproque : on ne se rattache pas comme porteur à un projet dont on détient
 * déjà des parts de la société support (409).
 *
 * 409 et non 403 : le refus ne tient pas à l'identité du demandeur mais à un
 * ÉTAT existant — une détention déjà constituée. Céder ces parts lèverait
 * l'obstacle, ce qu'un 403 laisserait croire définitif.
 */
export class DetenteurDePartsDeLaSocieteSupportError extends ConflitsInteretsError {
  readonly kind = ConflitsInteretsErrorKind.CONFLICT;
  readonly code = 'CONFLIT_INTERETS_DETENTION_SOCIETE_SUPPORT';

  constructor(motif: string) {
    super(motif);
  }
}
