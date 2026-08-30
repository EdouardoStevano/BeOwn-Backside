import type {
  Transaction,
  TransactionNaissante,
} from '../aggregates/transaction';

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

/**
 * Ce qu'il advient d'un mouvement qu'on tente de consigner.
 *
 * Trois issues et non un booléen : « le mouvement a déjà été consigné » et
 * « le solde ne le couvre pas » sont deux situations que l'appelant traite
 * différemment — la première est un succès idempotent qu'on ne signale pas au
 * titulaire, la seconde un refus qu'on lui explique.
 */
export type ResultatDeConsignation =
  | { issue: 'consigne'; mouvement: Transaction }
  | { issue: 'deja-consigne' }
  | { issue: 'solde-insuffisant' };

export interface TransactionRepository {
  /** Consigne un mouvement au registre, sans effet sur aucun solde. */
  enregistrer(mouvement: TransactionNaissante): Promise<Transaction>;

  /** Persiste l'état d'un mouvement existant (transition jouée). */
  save(mouvement: Transaction): Promise<Transaction>;

  findById(id: string): Promise<Transaction | null>;

  /** Les mouvements qui ont traversé un portefeuille, du plus récent au plus ancien. */
  findByWallet(walletId: string): Promise<Transaction[]>;

  /** Le mouvement déjà consigné sous cette clé, s'il existe. */
  findByIdempotencyKey(key: string): Promise<Transaction | null>;

  // ── Les deux gestes où l'argent bouge ────────────────────────────────────
  //
  // Ils écrivent **deux** agrégats — le mouvement et le solde — dans une seule
  // transaction de base. §17 demande qu'une transaction corresponde à un seul
  // agrégat, et c'est la bonne règle partout ailleurs ; elle cède ici, et il
  // faut dire pourquoi plutôt que de la contourner en silence.
  //
  // Une écriture au registre sans effet sur le solde, ou l'inverse, n'est pas
  // un décalage qui se rattrape à la prochaine lecture : c'est de l'argent
  // qui existe d'un côté et pas de l'autre. La cohérence éventuelle du §18
  // suppose qu'un état intermédiaire soit tolérable — ici il ne l'est pas, et
  // c'est précisément ce qu'un ledger comptable refuse.
  //
  // Ces méthodes sont donc **les seules** de tout le contexte à déplacer de
  // l'argent, et elles sont ici plutôt que dans un use case pour que
  // l'atomicité et le verrou — qui sont de l'infrastructure — ne remontent
  // jamais dans la couche application. Celle-ci décide *quel* mouvement
  // consigner ; elle n'a pas à savoir qu'un `EntityManager` existe, ce qui
  // était le cas jusqu'ici jusque dans le contrôleur HTTP.

  /**
   * Consigne une entrée d'argent et crédite le portefeuille, d'un seul geste.
   *
   * L'ordre compte, et c'est lui la garde d'idempotence : le mouvement est
   * **inséré d'abord**, et la contrainte d'unicité sur la clé rejette tout
   * doublon avant que le solde n'ait bougé. C'est ce qui permet à la
   * confirmation par le front et au webhook Stripe de traiter le même
   * `PaymentIntent` en même temps sans créditer deux fois.
   */
  consignerUnCredit(
    mouvement: TransactionNaissante,
  ): Promise<ResultatDeConsignation>;

  /**
   * Consigne une sortie d'argent et débite le portefeuille, d'un seul geste.
   *
   * Le débit est **conditionnel** — `solde >= montant` sous verrou — parce que
   * deux retraits concurrents éprouveraient sinon la même lecture obsolète et
   * passeraient tous deux. L'agrégat a déjà refusé le débit à découvert en
   * amont : cette condition-ci ne répète pas la règle, elle la rend vraie sous
   * concurrence (voir {@link Wallet}).
   */
  consignerUnDebit(
    mouvement: TransactionNaissante,
  ): Promise<ResultatDeConsignation>;

  /**
   * Rend au portefeuille le montant d'un mouvement qui n'a pas abouti.
   *
   * `decider` est la **décision du domaine**, rejouée sous verrou sur l'état
   * réellement en base : c'est `Transaction.recrediter()`, qui refuse un
   * mouvement déjà défait. Le solde n'est rendu que si elle répond `true` —
   * ce qui rend l'opération idempotente sans que l'appelant ait à relire quoi
   * que ce soit, et sans que ce port ait à connaître la règle.
   *
   * Passer la décision plutôt que ses paramètres est ce qui évite le
   * double-recrédit qu'un échec de versement synchrone **et** un webhook
   * `payout.failed` provoqueraient en se croisant.
   */
  rendreLeSolde(
    mouvementId: string,
    decider: (mouvement: Transaction) => boolean,
  ): Promise<'rendu' | 'sans-objet'>;
}
