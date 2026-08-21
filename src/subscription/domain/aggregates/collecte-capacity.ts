import {
  FractionsDemandeesIndisponiblesError,
  PlusAucuneFractionDisponibleError,
  QuantiteDeFractionsInvalideError,
} from '../errors/subscription.errors';
import type { ProjetSouscriptible } from '../value-objects/projet-souscriptible';

/** L'état observable de la collecte d'un projet, tel que la persistance le fournit. */
export interface CapaciteDeCollecteSnapshot {
  projetId: string;
  /** Nombre total de fractions émises par le projet. */
  nbFractionsTotal: number;
  /** Somme des fractions des investissements actifs (hors RETRACTE/ANNULE). */
  fractionsDejaVendues: number;
}

/**
 * **Capacité de collecte** — un agrégat par projet, propriétaire de l'invariant
 * d'**anti-survente** : la somme des fractions souscrites ne dépasse jamais le
 * nombre de fractions émises.
 *
 * Cet invariant porte sur *l'ensemble* des investissements d'un même projet ;
 * aucun `Investment` isolé ne peut donc le protéger (§6). Le charger dans
 * l'agrégat `Investment` obligerait à relire tous les investissements du projet
 * à chaque souscription — ni petit, ni scalable (§6.1). L'agrégat ne connaît
 * que les deux nombres dont la règle a besoin, exactement comme
 * `ReservationCapacity` côté Core Domain.
 *
 * `allouer()` est le seul chemin par lequel des fractions se réservent. Avant
 * lui, la même règle était recopiée **trois fois** — dans
 * `CreateInvestmentUseCase`, `InitiateInvestmentUseCase` et
 * `TopUpInvestmentUseCase` — et deux fois par use case : une pré-vérification
 * hors transaction, puis un recompte sous verrou. Les deux passes appellent
 * désormais le même agrégat ; c'est la seconde, alimentée par le recompte
 * verrouillé, qui fait foi.
 *
 * La sérialisation des allocations concurrentes reste, elle, une affaire
 * d'infrastructure : le verrou pessimiste sur la ligne projet, posé par la
 * couche application dans sa transaction. L'agrégat dit *si* l'allocation est
 * légitime ; il ne dit pas *comment* la rendre atomique.
 */
export class CollecteCapacity {
  private _fractionsDejaVendues: number;
  private readonly _projetId: string;
  private readonly _nbFractionsTotal: number;

  private constructor(etat: CapaciteDeCollecteSnapshot) {
    this._projetId = etat.projetId;
    this._nbFractionsTotal = etat.nbFractionsTotal;
    this._fractionsDejaVendues = etat.fractionsDejaVendues;
  }

  static reconstituer(etat: CapaciteDeCollecteSnapshot): CollecteCapacity {
    return new CollecteCapacity(etat);
  }

  /**
   * La capacité d'un projet donné, à partir de sa vue souscriptible et du
   * nombre de fractions déjà vendues.
   */
  static duProjet(
    projet: ProjetSouscriptible,
    fractionsDejaVendues: number,
  ): CollecteCapacity {
    return new CollecteCapacity({
      projetId: projet.projetId,
      nbFractionsTotal: projet.nbFractionsTotal,
      fractionsDejaVendues,
    });
  }

  /**
   * Réserve `nbFractions` sur la collecte, ou refuse — collecte pleine, ou
   * quantité demandée supérieure à ce qu'il reste. Les deux refus sont
   * distincts : « il n'en reste plus » et « il n'en reste que N » ne disent pas
   * la même chose à l'investisseur.
   */
  allouer(nbFractions: number): void {
    if (!Number.isInteger(nbFractions) || nbFractions <= 0) {
      throw new QuantiteDeFractionsInvalideError(nbFractions);
    }
    if (this.fractionsDisponibles <= 0) {
      throw new PlusAucuneFractionDisponibleError();
    }
    if (nbFractions > this.fractionsDisponibles) {
      throw new FractionsDemandeesIndisponiblesError(this.fractionsDisponibles);
    }

    this._fractionsDejaVendues += nbFractions;
  }

  get projetId(): string {
    return this._projetId;
  }

  get nbFractionsTotal(): number {
    return this._nbFractionsTotal;
  }

  get fractionsDejaVendues(): number {
    return this._fractionsDejaVendues;
  }

  get fractionsDisponibles(): number {
    return this._nbFractionsTotal - this._fractionsDejaVendues;
  }

  /**
   * Toutes les fractions sont souscrites : la collecte a atteint sa cible et
   * le projet peut passer FINANCE. C'est `catalog` qui opère ce passage — ce
   * contexte ne fait que constater le fait (§3.4).
   */
  get estIntegralementSouscrite(): boolean {
    return this._fractionsDejaVendues >= this._nbFractionsTotal;
  }
}
