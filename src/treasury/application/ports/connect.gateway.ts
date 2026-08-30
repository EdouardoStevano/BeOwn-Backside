import type { Money } from 'src/treasury/domain/value-objects/money.vo';

export const CONNECT_GATEWAY = Symbol('CONNECT_GATEWAY');

/**
 * L'état du compte par lequel un investisseur reçoit ses retraits.
 *
 * `payoutsEnabled` est le seul drapeau dont dépend une décision : les deux
 * autres sont rendus parce que le front affiche l'avancement de l'onboarding.
 */
export interface CompteDeRetrait {
  connected: boolean;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface DemandeDeTransfert {
  montant: Money;
  compteDestinataire: string;
  /** Rejouer la même clé ne crée pas un second transfert, côté fournisseur. */
  cleDIdempotence: string;
  metadata?: Record<string, string>;
}

export interface DemandeDeVersement {
  montant: Money;
  compteConnecte: string;
  cleDIdempotence: string;
  metadata?: Record<string, string>;
}

/** Ce qu'une synchronisation de compte apprend au contexte. */
export interface SyncCompteDeRetrait {
  found: boolean;
  /** Le compte vient de devenir capable de recevoir des fonds (false → true). */
  payoutsJustEnabled: boolean;
}

/**
 * Où en est un versement, dit dans le vocabulaire du contexte.
 *
 * Quatre états et non le statut brut du fournisseur : `paid`, `failed`,
 * `pending`, `in_transit` et `canceled` sont son vocabulaire, et deux d'entre
 * eux appellent la même décision chez nous. `inconnu` couvre le versement
 * introuvable — un identifiant périmé, ou un compte qui n'est plus le bon.
 */
export type EtatDuVersement = 'arrive' | 'echoue' | 'en-cours' | 'inconnu';

/**
 * Le compte de retrait d'un investisseur, et les deux gestes qui y portent des
 * fonds — vus par le contexte, pas par Stripe.
 *
 * **Ce port n'existait pas.** `StripeConnectAdapter`, une classe
 * d'infrastructure, était injectée telle quelle dans le contrôleur HTTP et
 * dans le use case de retrait : la couche application dépendait d'un
 * adaptateur concret, exactement ce que §33 et §40 (Dependency Inversion)
 * interdisent, et ce que le contexte avait pourtant déjà fait pour les
 * paiements avec {@link PaymentGateway}.
 *
 * Le vocabulaire est celui du métier et non celui du fournisseur : un
 * *transfert* porte les fonds jusqu'au compte de l'investisseur, un
 * *versement* les envoie à sa banque, et *rapatrier* les ramène quand le
 * versement échoue. « Transfer », « Payout » et « Reversal » restent de
 * l'autre côté de l'Anti-Corruption Layer (§20).
 *
 * Les montants sont des {@link Money} : la conversion en centimes est une
 * exigence de Stripe, elle appartient à l'adaptateur. Elle vivait en
 * `Math.round(amountMajor * 100)` recopié dans deux méthodes.
 */
export interface ConnectGateway {
  /**
   * L'URL d'onboarding hébergée par le fournisseur, le compte étant créé s'il
   * n'existe pas encore.
   */
  lienDOnboarding(params: {
    utilisateurId: number;
    email?: string;
    retourUrl: string;
    rafraichirUrl: string;
  }): Promise<string>;

  /** L'état du compte de retrait ; jamais `null` — un compte absent est un état. */
  statutDuCompte(utilisateurId: number): Promise<CompteDeRetrait>;

  /** Plateforme → compte connecté. Rend la référence du transfert. */
  transferer(demande: DemandeDeTransfert): Promise<string>;

  /**
   * Compte connecté → banque. Rend la référence du versement.
   *
   * Peut légitimement échouer quand le fournisseur verse déjà automatiquement :
   * l'appelant se repose alors sur ce versement automatique, et **ne défait
   * rien** — le transfert, lui, a réussi.
   */
  verser(demande: DemandeDeVersement): Promise<string>;

  /**
   * Où en est un versement déjà lancé.
   *
   * C'est le pendant en **lecture** de {@link verser}, et il n'existait pas :
   * le contexte n'apprenait le sort d'un versement que par les webhooks
   * `payout.*`. Un webhook non livré — plateforme injoignable, incident de
   * livraison — laissait donc le retrait figé `EN_COURS` indéfiniment, sans
   * aucun moyen de le débloquer autrement qu'en écrivant en base à la main.
   *
   * @param compteConnecte le versement vit dans le contexte du compte connecté,
   *   pas dans celui de la plateforme : le lire ailleurs ne le trouve pas.
   */
  etatDuVersement(
    versementId: string,
    compteConnecte: string,
  ): Promise<EtatDuVersement>;

  /**
   * Ramène à la plateforme les fonds d'un transfert dont le versement a échoué.
   *
   * Sans ce rapatriement, recréditer le portefeuille créerait l'argent : les
   * fonds seraient à la fois sur le compte connecté et sur le solde interne.
   */
  rapatrierLeTransfert(
    transfertId: string,
    cleDIdempotence: string,
  ): Promise<void>;

  /** À qui appartient ce compte connecté — `null` si à personne de connu. */
  titulaireDuCompte(compteId: number | string): Promise<number | null>;

  /**
   * Applique l'état de compte que le fournisseur vient d'annoncer.
   *
   * Le paramètre reste volontairement opaque : c'est la charge utile brute du
   * webhook, et l'adaptateur est le seul à en connaître la forme (§20).
   */
  synchroniserDepuisWebhook(compte: unknown): Promise<SyncCompteDeRetrait>;
}
