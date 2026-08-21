import { Rang } from '../value-objects/rang.vo';

/**
 * Ce qu'une politique de rang est en droit de considérer pour placer une
 * nouvelle réservation dans la file.
 */
export interface DemandeDeRang {
  /** Le rang qu'un ordre strictement chronologique attribuerait (FIFO). */
  prochainRangChronologique: Rang;
  /** Le montant demandé — un futur critère de score pourrait en tenir compte. */
  montant: number;
}

/**
 * **Politique d'attribution du rang** — le cas d'école du §22.
 *
 * Le cahier des charges se contredit sur la nature du rang : RG-RES-07
 * (§4.5.2) dit « ordre chronologique d'enregistrement (FIFO) », mais le
 * dictionnaire de données (§7.3.3, champ `rang_file`) précise « ordre dans la
 * file d'attente (**FIFO + critère de score**) ». Tant que le client n'a pas
 * tranché, l'attribution du rang reste une décision *volatile* : elle est
 * donc une Policy injectable, pas une ligne codée en dur dans
 * `ReservationCapacity.allouer()` — le jour où le critère de score arrive, on
 * remplace l'implémentation sans re-architecturer l'agrégat.
 */
export interface ReservationRankingPolicy {
  attribuer(demande: DemandeDeRang): Rang;
}

export const RESERVATION_RANKING_POLICY = Symbol('RESERVATION_RANKING_POLICY');

/**
 * L'implémentation par défaut : FIFO strict, conforme à RG-RES-07 tel
 * qu'énoncé aujourd'hui. Premier arrivé, premier dans la file.
 */
export class FifoRankingPolicy implements ReservationRankingPolicy {
  attribuer(demande: DemandeDeRang): Rang {
    return demande.prochainRangChronologique;
  }
}
