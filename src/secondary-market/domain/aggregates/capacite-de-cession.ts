import { FractionsIndisponiblesALaVenteError } from '../errors';

/** L'état observable du carnet pour un investissement donné. */
export interface CapaciteDeCessionSnapshot {
  investissementId: string;
  /** Fractions que le vendeur détient sur cet investissement. */
  fractionsDetenues: number;
  /** Fractions déjà offertes au carnet par des ordres `EN_CARNET`. */
  fractionsDejaEnCarnet: number;
}

/**
 * **Capacité de cession** — un agrégat par investissement, propriétaire de
 * l'invariant d'**anti-double-mise-en-vente** : la somme des fractions offertes
 * au carnet ne dépasse jamais les fractions réellement détenues.
 *
 * Sans lui, un porteur de 10 fractions passe deux ordres de 10 et vend
 * vingt fois ce qu'il possède — les deux acheteurs paient, un seul est servi.
 *
 * L'invariant porte sur *l'ensemble* des ordres d'un même investissement ;
 * aucun `SecondaryMarketOrder` isolé ne peut donc le protéger (§6). L'agrégat
 * ne connaît que les deux nombres dont la règle a besoin, exactement comme
 * `CollecteCapacity` côté souscription et `ReservationCapacity` côté Core
 * Domain.
 *
 * La sérialisation des inscriptions concurrentes reste, elle, une affaire
 * d'infrastructure : le verrou pessimiste sur la ligne investissement, posé
 * par la couche application dans sa transaction. L'agrégat dit *si*
 * l'inscription est légitime ; il ne dit pas *comment* la rendre atomique.
 */
export class CapaciteDeCession {
  private _fractionsDejaEnCarnet: number;
  private readonly _investissementId: string;
  private readonly _fractionsDetenues: number;

  private constructor(etat: CapaciteDeCessionSnapshot) {
    this._investissementId = etat.investissementId;
    this._fractionsDetenues = etat.fractionsDetenues;
    this._fractionsDejaEnCarnet = etat.fractionsDejaEnCarnet;
  }

  static reconstituer(etat: CapaciteDeCessionSnapshot): CapaciteDeCession {
    return new CapaciteDeCession(etat);
  }

  /**
   * Inscrit `nbFractions` au carnet, ou refuse. Seul chemin par lequel des
   * fractions s'offrent à la vente.
   */
  inscrire(nbFractions: number): void {
    if (nbFractions > this.disponibles) {
      throw new FractionsIndisponiblesALaVenteError(
        this.disponibles,
        this._fractionsDejaEnCarnet,
      );
    }

    this._fractionsDejaEnCarnet += nbFractions;
  }

  get investissementId(): string {
    return this._investissementId;
  }

  /** Fractions encore libres — détenues, moins celles déjà offertes. */
  get disponibles(): number {
    return this._fractionsDetenues - this._fractionsDejaEnCarnet;
  }

  get fractionsDetenues(): number {
    return this._fractionsDetenues;
  }

  get fractionsDejaEnCarnet(): number {
    return this._fractionsDejaEnCarnet;
  }

  /** Tout ce que le porteur détient est déjà au carnet. */
  get estIntegralementOfferte(): boolean {
    return this.disponibles <= 0;
  }
}
