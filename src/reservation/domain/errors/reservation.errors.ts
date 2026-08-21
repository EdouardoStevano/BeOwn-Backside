import { ReservationError, ReservationErrorKind } from './reservation.error';
import type { ReservationStatus } from '../enums/reservation-status.enum';

/*
 * Les messages reprennent mot pour mot ceux que les `BadRequestException` et
 * `NotFoundException` remplacées portaient : aucune réponse HTTP ne change.
 * Les `code` sont un ajout — ce sont les codes stables de l'Annexe B du
 * cahier des charges (§21), que le front peut consommer sans parser le texte.
 */

/** La réservation visée n'existe pas. */
export class ReservationIntrouvableError extends ReservationError {
  readonly kind = ReservationErrorKind.NOT_FOUND;

  constructor(reservationId: string) {
    super('Réservation introuvable.', {
      code: 'RESERVATION_NOT_FOUND',
      details: { reservationId },
    });
  }
}

/** Le projet visé par la réservation n'existe pas. */
export class ProjetIntrouvableError extends ReservationError {
  readonly kind = ReservationErrorKind.NOT_FOUND;

  constructor(projetId: string) {
    super('Projet introuvable.', {
      code: 'PROJECT_NOT_FOUND',
      details: { projetId },
    });
  }
}

/**
 * RG-RES : réserver n'est possible que sur un projet ANNONCÉ — la fenêtre
 * entre l'annonce et la publication, celle que le pré-investissement verrouille.
 */
export class ProjetHorsFenetreDePreInvestissementError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(projetId: string) {
    super(
      "Le pre-investissement n'est disponible que pour les projets en statut ANNONCE.",
      { code: 'PROJECT_NOT_OPEN', details: { projetId } },
    );
  }
}

/** Le porteur n'a pas activé le pré-investissement sur ce projet. */
export class PreInvestissementNonActiveError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(projetId: string) {
    super('Ce projet ne permet pas le pré-investissement.', {
      code: 'PROJECT_NOT_OPEN',
      details: { projetId },
    });
  }
}

/** RG-INV-02 appliqué à la réservation : le ticket plancher du projet. */
export class TicketSousLeMinimumError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(ticketMinimum: number) {
    super(`Le montant minimum est ${ticketMinimum} €.`, {
      code: 'TICKET_BELOW_MIN',
      details: { ticketMinimum },
    });
  }
}

/** RG-INV-03 appliqué à la réservation : le ticket plafond du projet. */
export class TicketAuDessusDuMaximumError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(ticketMaximum: number) {
    super(`Le montant maximum est ${ticketMaximum} €.`, {
      code: 'TICKET_ABOVE_MAX',
      details: { ticketMaximum },
    });
  }
}

/**
 * RG-RES-05 : le plafond global de pré-investissement du projet est atteint —
 * l'invariant que `ReservationCapacity` protège (§6).
 */
export class PlafondPreInvestissementAtteintError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(plafond: number, dejaReserve: number, demande: number) {
    super('Le plafond de pré-investissement pour ce projet est atteint.', {
      code: 'RESERVATION_FULL',
      details: { plafond, dejaReserve, demande },
    });
  }
}

/** Un montant réservé est strictement positif — le zéro n'engage rien. */
export class MontantReserveInvalideError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(montant: number) {
    super('Le montant réservé doit être strictement positif.', {
      code: 'INVALID_AMOUNT',
      details: { montant },
    });
  }
}

/** L'annulation investisseur est réservée au titulaire de la réservation. */
export class AnnulationReserveeAuTitulaireError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor() {
    super('Vous ne pouvez pas annuler cette réservation.', {
      code: 'NOT_RESERVATION_OWNER',
    });
  }
}

/** Seules `EN_ATTENTE` et `VALIDEE` sont annulables. */
export class ReservationNonAnnulableError extends ReservationError {
  readonly kind = ReservationErrorKind.INVALID_INPUT;

  constructor(statut: ReservationStatus) {
    super('Cette réservation ne peut pas être annulée.', {
      code: 'RESERVATION_NOT_CANCELLABLE',
      details: { statut },
    });
  }
}

/** Convertir deux fois créerait deux investissements pour un engagement. */
export class ReservationDejaConvertieError extends ReservationError {
  readonly kind = ReservationErrorKind.CONFLICT;

  constructor() {
    super('Cette réservation est déjà convertie en investissement.', {
      code: 'RESERVATION_ALREADY_CONVERTED',
    });
  }
}

/** Une réservation annulée ou expirée ne se convertit pas. */
export class ReservationNonConvertibleError extends ReservationError {
  readonly kind = ReservationErrorKind.CONFLICT;

  constructor(statut: ReservationStatus) {
    super('Cette réservation ne peut pas être convertie.', {
      code: 'RESERVATION_NOT_CONVERTIBLE',
      details: { statut },
    });
  }
}

/** Seule une `EN_ATTENTE` se valide. */
export class ReservationNonValidableError extends ReservationError {
  readonly kind = ReservationErrorKind.CONFLICT;

  constructor(statut: ReservationStatus) {
    super('Cette réservation ne peut pas être validée.', {
      code: 'RESERVATION_NOT_VALIDATABLE',
      details: { statut },
    });
  }
}

/** Seule une `EN_ATTENTE` expire — une réservation validée ne s'évapore pas. */
export class ReservationNonExpirableError extends ReservationError {
  readonly kind = ReservationErrorKind.CONFLICT;

  constructor(statut: ReservationStatus) {
    super('Cette réservation ne peut pas expirer.', {
      code: 'RESERVATION_NOT_EXPIRABLE',
      details: { statut },
    });
  }
}

/**
 * Un rang non entier ou < 1 ne peut provenir que d'une donnée corrompue ou
 * d'un défaut de programmation — jamais d'une entrée utilisateur.
 */
export class RangInvalideError extends ReservationError {
  readonly kind = ReservationErrorKind.UNEXPECTED;

  constructor(valeur: number) {
    super(`Rang de réservation invalide : ${valeur}.`, {
      details: { valeur },
    });
  }
}
