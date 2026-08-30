import { round2 } from 'src/shared/money/round2';
import { PourcentageInvalideError } from '../errors/treasury.errors';

/**
 * Un taux exprimé en pour-cent — `15` pour quinze pour cent.
 *
 * §8 le nomme parmi les Value Objects que ce projet doit avoir, et il manquait :
 * les cinq taux de commission circulaient en `number`, et la division par 100
 * était réécrite à chaque calcul — `montant * (rate.propertySaleGainFeePct /
 * 100)`. Un taux stocké en fraction plutôt qu'en pour-cent, ou une division
 * oubliée, produit une erreur de deux ordres de grandeur sur une commission
 * réelle, et rien dans le type ne l'aurait signalée.
 *
 * **L'unité est dans le type**, plus dans la tête de l'appelant : `de(15)` dit
 * quinze pour cent, `appliqueA(1000)` rend `150`.
 *
 * **Immuable**, comme tout Value Object (§8).
 */
export class Pourcentage {
  private constructor(private readonly valeur: number) {}

  /**
   * @throws PourcentageInvalideError si le taux n'est pas un nombre fini
   *   positif. Le plafond de 100 n'est **pas** imposé : une pénalité ou un
   *   taux de change interne peut légitimement le dépasser, et ce n'est pas à
   *   ce VO d'en décider — c'est au barème qui l'emploie.
   */
  static de(valeur: number): Pourcentage {
    if (!Number.isFinite(valeur) || valeur < 0) {
      throw new PourcentageInvalideError(valeur);
    }
    return new Pourcentage(valeur);
  }

  /** Aucun prélèvement — un frais désactivé, et non l'absence de barème. */
  static zero(): Pourcentage {
    return new Pourcentage(0);
  }

  /**
   * Reconstitution depuis la persistance : le repli remplace toute valeur
   * illisible, plutôt que de lever.
   *
   * C'est ce que faisait le `pick` du service — une clé absente, un `null`, une
   * chaîne venue d'un blob JSON libre retombent sur le défaut. Une ligne de
   * paramétrage mal saisie ne doit pas empêcher la plateforme de facturer.
   */
  static restore(valeur: unknown, defaut: Pourcentage): Pourcentage {
    return typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0
      ? new Pourcentage(valeur)
      : defaut;
  }

  /**
   * Ce que ce taux prélève sur un montant, arrondi au centime.
   *
   * L'arrondi est **ici** et non chez l'appelant : c'est le montant prélevé
   * qui doit tomber juste, et le laisser au calcul suivant laisserait des
   * fractions de centime s'accumuler dans les répartitions.
   */
  appliqueA(montant: number): number {
    return round2(montant * (this.valeur / 100));
  }

  /** Le taux tel que la table le range, et tel que l'API le publie. */
  get valeurEnPourCent(): number {
    return this.valeur;
  }

  estNul(): boolean {
    return this.valeur === 0;
  }
}
