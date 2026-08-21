/**
 * Ports « destinations de retrait » (external accounts du compte Stripe Connect).
 *
 * ISP — deux ports distincts plutôt qu'un dépôt unique :
 *  - `PayoutMethodsReader` : consultation + validation d'appartenance. C'est le
 *    SEUL port injecté dans le chemin retrait, qui ne peut donc structurellement
 *    pas modifier les destinations de l'investisseur ;
 *  - `PayoutMethodsWriter` : ajout / suppression / choix par défaut, réservé au
 *    cas d'usage de gestion exposé par `PayoutMethodsController`.
 *
 * DIP — l'implémentation Stripe (`StripePayoutMethodsService`) et
 * l'implémentation en mémoire (`InMemoryPayoutMethodsAdapter`) honorent le même
 * contrat, vérifié par une suite de tests unique (payout-methods.contract.spec).
 *
 * ADR-2 : aucune de ces données n'est persistée en base. Stripe est la source de
 * vérité des destinations de retrait ; on lit à la demande.
 */

/**
 * Nature de la destination. `card` = carte de débit, `bank_account` = IBAN.
 * Champ ADDITIF au contrat d'API : le front peut l'ignorer, mais il lui permet
 * de choisir le bon visuel tant que les cartes ne sont pas ouvertes en zone
 * euro (cf. sortie de sonde, ADR-3).
 */
export type PayoutMethodType = 'card' | 'bank_account';

/** Méthode de versement demandée à Stripe. */
export type PayoutMethodKind = 'instant' | 'standard';

/**
 * Vue exposée au front. Volontairement pauvre : jamais de PAN, jamais d'IBAN
 * complet — `last4` uniquement, comme Stripe le renvoie.
 */
export interface PayoutMethodView {
  id: string;
  type: PayoutMethodType;
  /** Réseau de la carte (`visa`…) ou nom de la banque pour un IBAN. */
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  /** `available_payout_methods` du compte externe contient `instant`. */
  instantEligible: boolean;
  /** Code ISO 4217 en majuscules (EUR). */
  currency: string;
  country: string | null;
}

/** Solde du compte connecté, en unité MAJEURE (euros), pas en centimes. */
export interface InstantBalanceView {
  available: number;
  instantAvailable: number;
  currency: 'EUR';
}

/**
 * Codes d'erreur métier stables consommés par le front. Traduits en statut HTTP
 * par `PayoutMethodExceptionFilter` — une seule table de correspondance, aucun
 * `switch` dans les contrôleurs.
 */
export type PayoutMethodErrorCode =
  | 'CONNECT_NOT_READY'
  | 'NO_PAYOUT_METHOD'
  | 'CARD_NOT_INSTANT_ELIGIBLE'
  | 'CARD_REJECTED'
  | 'AMOUNT_OUT_OF_RANGE'
  | 'CANNOT_DELETE_DEFAULT';

/**
 * Erreur métier typée. Le `message` est destiné à l'utilisateur final (français,
 * sans détail technique) ; la cause Stripe brute reste dans les logs.
 */
export class PayoutMethodError extends Error {
  constructor(
    readonly code: PayoutMethodErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayoutMethodError';
  }
}

export abstract class PayoutMethodsReader {
  /** Destinations de retrait du compte connecté (défaut en tête). */
  abstract list(connectedAccountId: string): Promise<PayoutMethodView[]>;

  /**
   * Destination `payoutMethodId` SI elle appartient à `connectedAccountId`,
   * `null` sinon. C'est la garantie anti-IDOR : l'identifiant de compte connecté
   * vient toujours de la base (jamais du client) et Stripe répond
   * `resource_missing` pour une destination d'un autre compte (vérifié en sonde).
   */
  abstract find(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<PayoutMethodView | null>;

  /** Solde disponible / disponible en instantané du compte connecté (EUR). */
  abstract getInstantBalance(
    connectedAccountId: string,
  ): Promise<InstantBalanceView>;
}

export abstract class PayoutMethodsWriter {
  /**
   * Attache une carte de débit tokenisée côté client (`tok_...`).
   * Le backend ne voit JAMAIS de PAN ni de CVC.
   * @throws PayoutMethodError('CARD_REJECTED')
   */
  abstract attachCard(
    connectedAccountId: string,
    token: string,
  ): Promise<PayoutMethodView>;

  /**
   * Détache une destination.
   * @throws PayoutMethodError('NO_PAYOUT_METHOD') si elle n'appartient pas au compte
   * @throws PayoutMethodError('CANNOT_DELETE_DEFAULT') si c'est la destination
   *         par défaut de la devise (refus Stripe vérifié en sonde)
   */
  abstract detach(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<void>;

  /**
   * Désigne la destination par défaut pour la devise du compte.
   * @throws PayoutMethodError('NO_PAYOUT_METHOD')
   */
  abstract setDefault(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<PayoutMethodView>;
}
