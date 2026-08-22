import { formatEur } from 'src/shared/money/format-eur';
import { SubscriptionError, SubscriptionErrorKind } from './subscription.error';
import type { InvestmentStatus } from '../enums/investment-status.enum';

/*
 * Les messages reprennent ceux que les `BadRequestException`,
 * `ForbiddenException` et `NotFoundException` remplacées portaient : les
 * réponses HTTP ne changent pas. Les `code` sont un ajout — les codes stables
 * de l'Annexe B du cahier des charges (§21), que le front peut consommer sans
 * parser le texte.
 *
 * Deux variantes de message qui ne différaient que par leur ponctuation
 * (« Projet introuvable » / « Projet introuvable. ») ont été alignées sur une
 * seule forme : trois use cases refusaient la même chose avec trois textes
 * légèrement différents, ce que le contexte ne peut pas revendiquer comme une
 * distinction métier.
 */

// ── Le projet visé ──────────────────────────────────────────────────────────

/** Le projet visé par la souscription n'existe pas. */
export class ProjetIntrouvableError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.NOT_FOUND;

  constructor(projetId?: string) {
    super('Projet introuvable.', {
      code: 'PROJECT_NOT_FOUND',
      details: projetId !== undefined ? { projetId } : undefined,
    });
  }
}

/**
 * RG-INV : on ne souscrit que sur un projet PUBLIÉ en cours de collecte —
 * la collecte est close parce que la cible est atteinte.
 */
export class ProjetDejaFinanceError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(projetId?: string) {
    super('Ce projet est déjà entièrement financé.', {
      code: 'PROJECT_NOT_OPEN',
      details: projetId !== undefined ? { projetId } : undefined,
    });
  }
}

/** RG-INV : le projet n'est pas (ou plus) dans sa fenêtre de collecte. */
export class ProjetHorsCollecteError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(projetId?: string) {
    super(
      "L'investissement n'est possible que sur un projet en cours de collecte.",
      {
        code: 'PROJECT_NOT_OPEN',
        details: projetId !== undefined ? { projetId } : undefined,
      },
    );
  }
}

// ── Les fractions (invariant d'anti-survente) ───────────────────────────────

/** La collecte a alloué toutes ses fractions — l'invariant de `CollecteCapacity`. */
export class PlusAucuneFractionDisponibleError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor() {
    super('Il ne reste plus de fractions disponibles sur ce projet.', {
      code: 'COLLECTE_FULL',
    });
  }
}

/** Il reste des fractions, mais moins que la quantité demandée. */
export class FractionsDemandeesIndisponiblesError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(disponibles: number) {
    super(`Seulement ${disponibles} fraction(s) disponible(s) sur ce projet.`, {
      code: 'COLLECTE_INSUFFICIENT_FRACTIONS',
      details: { disponibles },
    });
  }
}

/** Une souscription porte sur au moins une fraction entière. */
export class QuantiteDeFractionsInvalideError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(demandees: number) {
    super('Le nombre de fractions doit être un entier strictement positif.', {
      code: 'INVALID_FRACTION_QUANTITY',
      details: { demandees },
    });
  }
}

/** RG-INV-03 : le ticket plafond du projet. */
export class TicketAuDessusDuMaximumError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(ticketMaximum: number) {
    super(
      `Votre investissement dépasse le ticket maximum de ${ticketMaximum}.`,
      { code: 'TICKET_ABOVE_MAX', details: { ticketMaximum } },
    );
  }
}

// ── Le wallet et le plafond réglementaire ───────────────────────────────────

/** Souscrire exige un wallet investisseur alimenté. */
export class WalletIntrouvableError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor() {
    super(
      "Wallet introuvable. Veuillez alimenter votre compte avant d'investir.",
      {
        code: 'WALLET_NOT_FOUND',
      },
    );
  }
}

/** Le solde disponible ne couvre pas le montant souscrit. */
export class SoldeInsuffisantError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(disponible: number, requis: number) {
    super(
      `Solde insuffisant. Disponible : ${formatEur(disponible)} — Requis : ${formatEur(requis)}`,
      { code: 'WALLET_INSUFFICIENT', details: { disponible, requis } },
    );
  }
}

/**
 * PSFP (art. 21) : l'investisseur non-averti dépasse le plafond que sa
 * catégorie et son patrimoine recommandent, sans avoir donné le consentement
 * explicite exigé.
 */
export class PlafondPsfpDepasseSansConsentementError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.INVALID_INPUT;

  constructor(
    plafondConseille: number,
    patrimoineDeclare: number,
    plancher: number,
    montant: number,
  ) {
    super(
      `Votre statut "non averti" recommande de ne pas dépasser ${formatEur(plafondConseille)} par investissement ` +
        `(max entre ${formatEur(plancher)} et 5% de votre patrimoine déclaré de ${formatEur(patrimoineDeclare)}). ` +
        `Pour passer outre, cochez la case de consentement explicite "consentementDepassementLimite": true.`,
      {
        code: 'PSFP_CAP_EXCEEDED',
        details: { plafondConseille, patrimoineDeclare, montant },
      },
    );
  }
}

// ── L'investissement lui-même ───────────────────────────────────────────────

/** L'investissement visé n'existe pas. */
export class InvestissementIntrouvableError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.NOT_FOUND;

  constructor(investissementId?: string) {
    super('Investissement introuvable', {
      code: 'INVESTMENT_NOT_FOUND',
      details:
        investissementId !== undefined ? { investissementId } : undefined,
    });
  }
}

/** Un investissement ne se consulte ni ne se modifie hors de son titulaire. */
export class AccesInvestissementRefuseError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.FORBIDDEN;

  constructor() {
    super('Accès refusé', { code: 'NOT_INVESTMENT_OWNER' });
  }
}

/** La rétractation est réservée au titulaire de l'investissement. */
export class RetractationReserveeAuTitulaireError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.FORBIDDEN;

  constructor() {
    super('Vous ne pouvez annuler que vos propres investissements', {
      code: 'NOT_INVESTMENT_OWNER',
    });
  }
}

/** Seul un investissement `CONFIRME` peut être rétracté. */
export class InvestissementNonRetractableError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor(statut: InvestmentStatus) {
    super(`Investissement au statut "${statut}" non annulable`, {
      code: 'INVESTMENT_NOT_RETRACTABLE',
      details: { statut },
    });
  }
}

/**
 * PSFP : le droit de rétractation de 4 jours n'est ouvert qu'aux investisseurs
 * non-avertis — un averti ou un professionnel s'engage sans fenêtre de retrait.
 */
export class SansDelaiDeRetractationError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor() {
    super(
      "Cet investissement n'a pas de délai de rétractation (vous êtes investisseur averti ou professionnel)",
      { code: 'NO_RETRACTION_WINDOW' },
    );
  }
}

/** PSFP : la fenêtre de rétractation de 4 jours s'est refermée. */
export class DelaiDeRetractationExpireError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor(echeanceDuDelai?: Date) {
    super('Le délai de rétractation de 4 jours est dépassé', {
      code: 'RETRACTION_WINDOW_CLOSED',
      details:
        echeanceDuDelai !== undefined
          ? { delaiRetractationJusquAu: echeanceDuDelai }
          : undefined,
    });
  }
}

/**
 * Une requête concurrente a déjà rétracté cet investissement — le claim
 * conditionnel en base n'a affecté aucune ligne, et le remboursement n'a donc
 * pas eu lieu deux fois.
 */
export class InvestissementDejaRetracteError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor() {
    super('Investissement déjà rétracté ou non annulable', {
      code: 'INVESTMENT_ALREADY_RETRACTED',
    });
  }
}

/** Seul un investissement `CONFIRME` accepte des fractions supplémentaires. */
export class InvestissementNonCompletableError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor(statut: InvestmentStatus) {
    super('Seuls les investissements confirmés peuvent être complétés', {
      code: 'INVESTMENT_NOT_TOPPABLE',
      details: { statut },
    });
  }
}

/** Compléter suppose des fractions encore vivantes à compléter. */
export class InvestissementSansFractionsActivesError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor() {
    super('Cet investissement ne possède plus de fractions actives', {
      code: 'INVESTMENT_NO_ACTIVE_FRACTIONS',
    });
  }
}

/** Un investissement signé ne se signe pas deux fois (§21, à ajouter en Annexe B). */
export class InvestissementDejaSigneError extends SubscriptionError {
  readonly kind = SubscriptionErrorKind.CONFLICT;

  constructor() {
    super('Cet investissement est déjà signé.', {
      code: 'INVESTMENT_ALREADY_SIGNED',
    });
  }
}
