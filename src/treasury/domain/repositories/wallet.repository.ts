import type { Wallet, WalletNaissant } from '../aggregates/wallet';
import type { WalletType } from '../enums/wallet.enum';

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');

/**
 * La collection des portefeuilles (§10) — orientée agrégat, pas table.
 *
 * `creer` et `save` sont distincts parce que l'identité et la date d'ouverture
 * naissent en base : un `WalletNaissant` entre, un agrégat complet ressort.
 *
 * Deux méthodes de l'ancien port ont disparu :
 *
 * - `updateSolde(walletId, delta)` — écrire un solde sans passer par l'agrégat
 *   (§6), et sans que personne ne l'appelle : c'était du code mort qui offrait
 *   malgré tout un chemin pour contourner l'invariant central du contexte. Les
 *   parcours qui déplacent réellement de l'argent font leur décrément
 *   conditionnel sous verrou, dans leur transaction ;
 * - `findWalletByProject(projetId, type)` — sans appelant depuis longtemps.
 *
 * Le registre des mouvements a son propre port : voir
 * {@link TransactionRepository}. Les deux vivaient dans une seule interface
 * alors qu'ils servent deux agrégats distincts — un portefeuille porte un
 * solde, une transaction relate un mouvement entre deux portefeuilles et ne
 * peut donc appartenir à aucun des deux (§6.2, §10).
 */
export interface WalletRepository {
  /** Ouvre un portefeuille et rend l'agrégat complet. */
  creer(naissant: WalletNaissant): Promise<Wallet>;

  /** Persiste l'état d'un portefeuille existant (mouvement joué). */
  save(wallet: Wallet): Promise<Wallet>;

  findById(id: string): Promise<Wallet | null>;

  /** Le portefeuille d'un utilisateur, éventuellement filtré par nature. */
  findByUser(userId: number, type?: WalletType): Promise<Wallet | null>;
}
