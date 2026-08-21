export const SORTIE_SETTLEMENT_PORT = Symbol('SORTIE_SETTLEMENT_PORT');

/** Ce qui doit être versé à un investisseur au titre d'une sortie. */
export interface VersementSortie {
  investissementId: string;
  utilisateurId: number;
  /** Retour de capital, 1:1, non imposable. */
  capitalRembourse: number;
  /** Quote-part de plus-value nette de frais. Négative en cas de moins-value. */
  plusValuePart: number;
  impotRevenu: number;
  prelevementsSociaux: number;
  /** Ce qui atterrit réellement sur le wallet investisseur. */
  netVerse: number;
}

/** L'ordre complet, tel que le domaine l'a calculé. */
export interface OrdreReglementSortie {
  sortieId: string;
  projetId: string;
  /** Plus-value avant frais — tracée sur l'écriture de frais de performance. */
  plusValueBrute: number;
  /** Frais de performance prélevés par la plateforme. `0` si moins-value. */
  fraisPerformance: number;
  versements: readonly VersementSortie[];
}

export interface ResultatReglementSortie {
  /** Versements réellement passés — un investisseur sans wallet est ignoré. */
  versementsEffectues: VersementSortie[];
}

/**
 * Exécute les mouvements d'argent d'une sortie : crédit des wallets
 * investisseurs, séquestres fiscaux, frais de performance, écritures de ledger.
 *
 * `ExecuteSortieUseCase` faisait tout cela lui-même, en injectant une
 * `DataSource`, un `Repository<WalletEntity>` et un `Repository<TransactionEntity>`
 * dans la couche applicative : de l'accès base de données hors repository
 * (§12.3), et la connaissance des tables d'un autre Bounded Context (Wallets)
 * remontée jusqu'à un use case de Projects. Deux cent cinquante lignes
 * d'`em.save(...)` autour desquelles il était impossible d'éprouver le calcul
 * de la distribution.
 *
 * Le partage des responsabilités est net : **le domaine calcule** — voir
 * `RepartitionSortieService` — et **l'adapter écrit**, dans une seule
 * transaction, avec les clés d'idempotence qui protègent d'un rejeu.
 */
export interface SortieSettlementPort {
  regler(ordre: OrdreReglementSortie): Promise<ResultatReglementSortie>;
}
