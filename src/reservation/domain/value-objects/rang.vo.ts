import { RangInvalideError } from '../errors/reservation.errors';

/**
 * **Rang** — la position dans la file d'attente d'un projet (glossaire §4.1).
 *
 * C'est la contrepartie que l'investisseur obtient en réservant : à
 * l'ouverture de la collecte, les conversions se font dans l'ordre des rangs
 * (RG-RES-07). Un rang est strictement positif et entier ; deux réservations
 * d'un même projet ne partagent jamais le même rang — cette unicité-là est
 * l'invariant de `ReservationCapacity`, pas du rang isolé.
 */
export class Rang {
  private constructor(public readonly valeur: number) {}

  static de(valeur: number): Rang {
    if (!Number.isInteger(valeur) || valeur < 1) {
      throw new RangInvalideError(valeur);
    }
    return new Rang(valeur);
  }

  static premier(): Rang {
    return new Rang(1);
  }

  suivant(): Rang {
    return new Rang(this.valeur + 1);
  }

  precede(autre: Rang): boolean {
    return this.valeur < autre.valeur;
  }

  egale(autre: Rang): boolean {
    return this.valeur === autre.valeur;
  }
}
