import type { Money } from 'src/treasury/domain/value-objects/money.vo';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreatePaymentIntentParams {
  montant: Money;
  utilisateurId: number;
  metadata?: Record<string, string>;
}

/**
 * Un paiement tel que le fournisseur le rend, traduit dans le vocabulaire du
 * contexte.
 *
 * `montant` est une {@link Money} et non plus « un entier dans la plus petite
 * unité » : la division par 100 était faite par chaque appelant — dont le
 * contrôleur HTTP — et un seul oubli valait deux ordres de grandeur sur un
 * crédit. Elle appartient à l'adaptateur, qui est le seul à savoir que Stripe
 * compte en centimes (§20).
 */
export interface Paiement {
  intentId: string;
  clientSecret: string;
  /** Statut brut du fournisseur ; `aAbouti` en porte la seule lecture utile. */
  statut: string;
  montant: Money;
  /**
   * Le compte qui a ouvert ce paiement, tel que le fournisseur l'a mémorisé.
   * `null` quand le paiement n'en porte pas — auquel cas personne ne peut
   * s'en réclamer (voir `PaiementEtrangerAuCompteError`).
   */
  utilisateurId: number | null;
  /** `depot`, `souscription`… — ce que le paiement finance. */
  operationType: string;
  metadata: Record<string, string>;
}

/** Ce que tout événement porte, quelle que soit sa nature. */
interface EnteteEvenement {
  id: string;
  type: string;
  /** Le compte connecté concerné, pour les événements Connect. */
  compte: string | null;
}

/** Un paiement vient d'aboutir. */
export interface EvenementPaiementAbouti extends EnteteEvenement {
  nature: 'paiement-abouti';
  paiement: Paiement;
}

/** Le compte de retrait d'un investisseur a changé d'état. */
export interface EvenementCompteMisAJour extends EnteteEvenement {
  nature: 'compte-mis-a-jour';
  compteId: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** L'objet brut, que seul l'adaptateur du compte sait relire. */
  brut: unknown;
}

/** Un versement vers la banque a abouti, ou échoué. */
export interface EvenementVersement extends EnteteEvenement {
  nature: 'versement-arrive' | 'versement-echoue';
  versementId: string | null;
  /** Le retrait que ce versement règle ; absent d'un versement automatique. */
  retraitId: string | null;
}

/**
 * Tout le reste — les `identity.*` destinés à la conformité, et les dizaines
 * d'événements qu'aucun contexte n'écoute.
 *
 * `brut` est **opaque** : ce contexte n'en lit rien, il ne fait que le relayer
 * au contexte qui en définit la forme.
 */
export interface EvenementRelaye extends EnteteEvenement {
  nature: 'a-relayer';
  brut: unknown;
}

/**
 * Un événement du fournisseur, dont la signature a été éprouvée **et dont la
 * charge utile est traduite**.
 *
 * Une union discriminée, et non un `data: any` : c'est le cœur de
 * l'Anti-Corruption Layer (§20). Les branches du webhook lisaient auparavant
 * `event.data.object.metadata.retraitTxId` à la main, avec le `any` que cela
 * suppose — chaque lecture était une hypothèse non vérifiée sur la forme de la
 * réponse d'un tiers, dans du code qui décide de mouvements d'argent.
 */
export type EvenementFournisseur =
  | EvenementPaiementAbouti
  | EvenementCompteMisAJour
  | EvenementVersement
  | EvenementRelaye;

export interface PaymentGateway {
  /** Ouvre un paiement et rend de quoi le confirmer côté navigateur. */
  ouvrirUnPaiement(params: CreatePaymentIntentParams): Promise<Paiement>;

  /** Relit un paiement chez le fournisseur — la source de vérité de son sort. */
  lireLePaiement(intentId: string): Promise<Paiement>;

  rembourser(chargeId: string, montant?: Money): Promise<void>;

  /**
   * Éprouve la signature de l'événement reçu et le traduit.
   *
   * @throws SignatureWebhookInvalideError si la signature ne correspond pas —
   *   une erreur de domaine et non l'exception du fournisseur, pour que le
   *   contrôleur n'ait rien à traduire (§21).
   */
  authentifierLEvenement(
    charge: Buffer,
    signature: string,
  ): EvenementFournisseur;
}
