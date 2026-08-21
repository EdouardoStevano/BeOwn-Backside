import { PlafondPreInvestissementAtteintError } from '../errors/reservation.errors';
import type { ReservationRankingPolicy } from '../policies/reservation-ranking.policy';
import { Rang } from '../value-objects/rang.vo';

/** L'état observable de la file d'un projet, tel que la persistance le fournit. */
export interface CapaciteDeReservationSnapshot {
  projetId: string;
  /** RG-RES-05 : plafond global de pré-investissement. `null` = pas de plafond. */
  plafond: number | null;
  /** Somme des montants des réservations actives (EN_ATTENTE, VALIDEE). */
  montantDejaReserve: number;
  /** Le rang qu'un ordre chronologique strict attribuerait au prochain arrivant. */
  prochainRangChronologique: number;
}

/**
 * **Capacité de réservation** — un agrégat par projet, propriétaire des deux
 * invariants qui portent sur *l'ensemble* des réservations d'un même projet
 * (§6) et qu'aucune `Reservation` isolée ne peut donc protéger :
 *
 * - **RG-RES-05** : la somme des montants réservés ne dépasse pas le plafond
 *   de pré-investissement du projet ;
 * - **RG-RES-07** : le rang attribué est unique et suit la politique de file
 *   en vigueur (FIFO aujourd'hui — voir {@link ReservationRankingPolicy}).
 *
 * Minuscule à dessein : cible, somme réservée, prochain rang. Charger toutes
 * les réservations d'un projet pour vérifier le plafond ne serait ni petit ni
 * scalable (§6.1) — l'agrégat ne connaît que les trois nombres dont les
 * invariants ont besoin.
 *
 * `allouer()` est le seul chemin d'obtention d'un rang. Avant lui, le plafond
 * se vérifiait dans `CreateReservationUseCase` (deux requêtes séparées, SUM
 * puis MAX+1 posé par le repository) : la règle vivait dans l'application et
 * l'attribution du rang dans un adapter de sortie — précisément ce que §6
 * interdit. La course entre deux allocations concurrentes reste bornée par
 * l'index unique `(projetId, rangFile)` en base ; verrouiller cette capacité
 * en une seule ligne transactionnelle est l'étape de durcissement suivante.
 */
export class ReservationCapacity {
  private _montantDejaReserve: number;
  private _prochainRangChronologique: Rang;
  private readonly _projetId: string;
  private readonly _plafond: number | null;

  private constructor(etat: CapaciteDeReservationSnapshot) {
    this._projetId = etat.projetId;
    this._plafond = etat.plafond;
    this._montantDejaReserve = etat.montantDejaReserve;
    this._prochainRangChronologique = Rang.de(etat.prochainRangChronologique);
  }

  static reconstituer(etat: CapaciteDeReservationSnapshot): ReservationCapacity {
    return new ReservationCapacity(etat);
  }

  /** File encore vierge : premier rang, rien de réservé. */
  static vierge(projetId: string, plafond: number | null): ReservationCapacity {
    return new ReservationCapacity({
      projetId,
      plafond,
      montantDejaReserve: 0,
      prochainRangChronologique: Rang.premier().valeur,
    });
  }

  /**
   * Verrouille `montant` sur la file et attribue le rang correspondant, ou
   * refuse si le plafond serait franchi (RG-RES-05).
   */
  allouer(montant: number, politique: ReservationRankingPolicy): Rang {
    if (
      this._plafond !== null &&
      this._montantDejaReserve + montant > this._plafond
    ) {
      throw new PlafondPreInvestissementAtteintError(
        this._plafond,
        this._montantDejaReserve,
        montant,
      );
    }

    const rang = politique.attribuer({
      prochainRangChronologique: this._prochainRangChronologique,
      montant,
    });

    this._montantDejaReserve += montant;
    this._prochainRangChronologique = this._prochainRangChronologique.suivant();

    return rang;
  }

  get projetId(): string {
    return this._projetId;
  }

  get plafond(): number | null {
    return this._plafond;
  }

  get montantDejaReserve(): number {
    return this._montantDejaReserve;
  }

  get capaciteRestante(): number | null {
    return this._plafond === null
      ? null
      : this._plafond - this._montantDejaReserve;
  }
}
