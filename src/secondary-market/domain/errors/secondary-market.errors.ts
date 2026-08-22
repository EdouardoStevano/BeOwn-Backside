import {
  SecondaryMarketError,
  SecondaryMarketErrorKind,
} from './secondary-market.error';

/*
 * Les messages reprennent, au caractère près, ceux que les
 * `BadRequestException`, `ForbiddenException` et `NotFoundException` du
 * contrôleur portaient : le front ne voit aucune différence.
 *
 * Une nuance de statut change, et elle est voulue — la même que celle déjà
 * actée par Subscription, Reservation et Treasury : les transitions
 * impossibles (acheter un ordre qui n'est plus au carnet, annuler un ordre
 * déjà exécuté) répondent **409 Conflict** là où elles répondaient 400.
 * L'appelant n'a rien à corriger dans sa requête, c'est l'état de la
 * ressource qui a bougé.
 */

// ── Le carnet ───────────────────────────────────────────────────────────────

/** L'ordre visé n'existe pas. */
export class OrdreIntrouvableError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.NOT_FOUND;

  constructor(ordreId?: string) {
    super('Ordre introuvable', {
      code: 'ORDER_NOT_FOUND',
      details: ordreId !== undefined ? { ordreId } : undefined,
    });
  }
}

/**
 * L'ordre n'est plus au carnet : il a été exécuté, annulé ou a expiré. Seul
 * `EN_CARNET` autorise un achat.
 */
export class OrdreIndisponibleError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.CONFLICT;

  constructor() {
    super('Ordre non disponible', { code: 'ORDER_NOT_AVAILABLE' });
  }
}

/** Un ordre exécuté, annulé ou expiré ne s'annule plus. */
export class OrdreNonAnnulableError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.CONFLICT;

  constructor() {
    super('Cet ordre ne peut plus être annulé', {
      code: 'ORDER_NOT_CANCELLABLE',
    });
  }
}

// ── L'investissement cédé ───────────────────────────────────────────────────

/** L'investissement qu'on veut mettre au carnet n'existe pas. */
export class InvestissementIntrouvableError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.NOT_FOUND;

  constructor(investissementId?: string) {
    super('Investissement introuvable', {
      code: 'INVESTMENT_NOT_FOUND',
      details:
        investissementId !== undefined ? { investissementId } : undefined,
    });
  }
}

/**
 * L'ordre existe mais l'investissement qu'il cède a disparu — incohérence de
 * données, jamais une entrée utilisateur.
 */
export class InvestissementSourceIntrouvableError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.NOT_FOUND;

  constructor() {
    super('Investissement source introuvable', {
      code: 'SOURCE_INVESTMENT_NOT_FOUND',
    });
  }
}

// ── Le règlement ────────────────────────────────────────────────────────────

/** Acheter au carnet suppose un wallet investisseur alimenté. */
export class WalletAcheteurIntrouvableError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.INVALID_INPUT;

  constructor() {
    super("Wallet introuvable. Alimentez votre compte avant d'acheter.", {
      code: 'WALLET_NOT_FOUND',
    });
  }
}

/** Le solde disponible ne couvre pas le prix de la cession. */
export class SoldeInsuffisantError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.INVALID_INPUT;

  constructor() {
    super('Solde insuffisant pour cet achat.', {
      code: 'WALLET_INSUFFICIENT',
    });
  }
}

// ── Les parties ─────────────────────────────────────────────────────────────

/** On ne met en vente que ses propres fractions. */
export class InvestissementNonDetenuError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.FORBIDDEN;

  constructor() {
    super('Cet investissement ne vous appartient pas', {
      code: 'NOT_INVESTMENT_OWNER',
    });
  }
}

/**
 * Le vendeur ne peut pas être son propre acheteur — une cession à soi-même
 * ferait tourner les frais de plateforme à vide, sans transfert réel.
 */
export class AchatDeSonPropreOrdreError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.FORBIDDEN;

  constructor() {
    super('Vous ne pouvez pas acheter votre propre ordre', {
      code: 'CANNOT_BUY_OWN_ORDER',
    });
  }
}

/** Seul le vendeur retire son annonce du carnet. */
export class AnnulationReserveeAuVendeurError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.FORBIDDEN;

  constructor() {
    super('Non autorisé', { code: 'NOT_ORDER_SELLER' });
  }
}

// ── Les quantités ───────────────────────────────────────────────────────────

/** L'achat porte sur une quantité hors des bornes de l'ordre. */
export class QuantiteAcheteeInvalideError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.INVALID_INPUT;

  constructor(maximum: number) {
    super(`Quantité invalide : doit être entre 1 et ${maximum}`, {
      code: 'INVALID_QUANTITY',
      details: { minimum: 1, maximum },
    });
  }
}

/**
 * Le vendeur n'a pas assez de fractions libres : celles déjà en carnet sur cet
 * investissement ne peuvent pas être mises en vente une seconde fois.
 */
export class FractionsIndisponiblesALaVenteError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.INVALID_INPUT;

  constructor(disponibles: number, dejaEnCarnet: number) {
    super(
      `Seulement ${disponibles} fraction(s) disponible(s) pour la vente (${dejaEnCarnet} déjà en carnet)`,
      {
        code: 'FRACTIONS_UNAVAILABLE',
        details: { disponibles, dejaEnCarnet },
      },
    );
  }
}

/** Une annonce sans fraction, ou à prix nul, n'a pas de sens au carnet. */
export class OrdreDeVenteInvalideError extends SecondaryMarketError {
  readonly kind = SecondaryMarketErrorKind.INVALID_INPUT;

  constructor(raison: string, details?: Record<string, unknown>) {
    super(`Ordre de vente invalide : ${raison}.`, {
      code: 'INVALID_ORDER',
      details,
    });
  }
}
