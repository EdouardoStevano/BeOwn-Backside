import type { Transaction } from '../aggregates/transaction';

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

/**
 * Le registre des mouvements (§10) — le *ledger* de la plateforme.
 *
 * `Transaction` est un agrégat à part entière, et non une entité du
 * portefeuille : un mouvement relie **deux** portefeuilles (source et
 * destination), il ne peut donc vivre à l'intérieur d'aucun des deux (§6.2).
 * Il a de surcroît son propre cycle de vie — initié, en cours, réussi, échoué,
 * remboursé — et sa propre clé d'idempotence, qui est le garde-fou contre le
 * double-règlement dans tous les parcours financiers de l'application.
 *
 * `findByIdempotencyKey` n'est pas une commodité technique : c'est la question
 * métier « ce mouvement a-t-il déjà eu lieu ? », que `subscription` pose avant
 * de rejouer une souscription et que le retrait pose avant d'en ouvrir un
 * second.
 */
export interface TransactionRepository {
  /** Consigne un mouvement au registre. */
  enregistrer(transaction: Transaction): Promise<Transaction>;

  /** Les mouvements qui ont traversé un portefeuille, du plus récent au plus ancien. */
  findByWallet(walletId: string): Promise<Transaction[]>;

  /** Le mouvement déjà consigné sous cette clé, s'il existe. */
  findByIdempotencyKey(key: string): Promise<Transaction | null>;
}
