import { round2 } from 'src/shared/money/round2';
// `shared/money` est de l'arithmétique décimale et du formatage, sans aucune
// notion de domaine (§25) : un domaine peut en dépendre sans violer §27.
import { formatEur } from 'src/shared/money/format-eur';
import {
  DeviseIncoherenteError,
  MontantInvalideError,
} from '../errors/treasury.errors';

/** La devise de référence de la plateforme — la seule qu'un wallet porte. */
export const DEVISE_PIVOT = 'EUR';

/** Un montant tel que la table le range : le nombre et sa devise, à plat. */
export interface MoneySnapshot {
  montant: number;
  devise: string;
}

/**
 * Une somme d'argent : un montant **et** la devise dans laquelle il s'exprime.
 *
 * Les deux voyageaient séparément — `montant: number` d'un côté,
 * `devise: string` de l'autre — sur le portefeuille, sur le mouvement, dans
 * les DTO et jusque dans les paramètres de méthode. Rien n'obligeait à les
 * transporter ensemble, et c'est exactement ce qui permettait d'imputer un
 * montant sur un solde d'une autre devise : la vérification existait, mais
 * comme un `if` facultatif au fond de `Wallet`, sur un paramètre `devise?`
 * que l'appelant pouvait simplement omettre.
 *
 * Ici la question ne se pose plus : additionner deux `Money` de devises
 * différentes ne rend pas un résultat douteux, cela **lève**. Le contexte ne
 * convertit pas — la conversion est un métier à part, avec ses taux, ses dates
 * et ses écarts, et §3.1 ne la lui confie pas.
 *
 * **Immuable, comme tout Value Object** (§8) : `plus` et `moins` rendent une
 * nouvelle somme, ils n'en modifient aucune. C'est ce qui rend impossible
 * qu'un solde change sous les pieds de qui le lisait.
 *
 * **Arrondi au centime à la construction**, une fois pour toutes. Le calcul
 * flottant produit des `0.1 + 0.2 = 0.30000000000000004` qui, accumulés sur un
 * échéancier, finissent par un centime d'écart entre le solde et la somme des
 * mouvements — un écart qu'aucun rapprochement bancaire ne pardonne. Les
 * colonnes sont des `decimal(18,2)` : le domaine se tient à la même précision
 * qu'elles, au lieu de laisser l'arrondi se produire à l'insertion.
 *
 * > Ce VO reste **dans `treasury`**. `catalog` avait déjà pesé la question et
 * > l'avait tranchée dans l'autre sens (voir `arrondirAuCentime`) : un VO
 * > monétaire global « obligerait à convertir aux frontières de quatre autres
 * > contextes — c'est un chantier en soi ». Le raisonnement tient toujours, et
 * > c'est pourquoi `Money` ne franchit aucune frontière : les snapshots, les
 * > ports et les mappers exposent des primitives, exactement comme avant. Le
 * > jour où un autre contexte voudra le même modèle, il se le donnera — le
 * > partager par le Shared Kernel en ferait un second domaine global (§25).
 */
export class Money {
  private constructor(
    private readonly _montant: number,
    private readonly _devise: string,
  ) {}

  /**
   * Une somme dans une devise donnée.
   *
   * @throws MontantInvalideError si le montant n'est pas un nombre fini, ou
   *   s'il est négatif : ce contexte ne connaît pas de solde débiteur, et un
   *   montant négatif est toujours un débit qui n'ose pas dire son nom. Le
   *   sens d'un mouvement s'exprime par `crediter` ou `debiter`, jamais par le
   *   signe.
   */
  static of(montant: number, devise: string = DEVISE_PIVOT): Money {
    if (!Number.isFinite(montant) || montant < 0) {
      throw new MontantInvalideError(montant);
    }
    return new Money(round2(montant), Money.normaliser(devise));
  }

  /** Raccourci de lecture pour la devise pivot — l'écrasante majorité des cas. */
  static euros(montant: number): Money {
    return Money.of(montant, DEVISE_PIVOT);
  }

  static zero(devise: string = DEVISE_PIVOT): Money {
    return new Money(0, Money.normaliser(devise));
  }

  /**
   * Depuis la plus petite unité — ce que Stripe manipule partout.
   *
   * La conversion vivait en `Number(intent.amount) / 100` au fil des appelants,
   * dont un dans la couche présentation. Elle est ici parce qu'elle décide d'un
   * montant crédité, et qu'un facteur 100 oublié à un seul de ces endroits est
   * une erreur de deux ordres de grandeur sur de l'argent réel.
   */
  static depuisCentimes(
    centimes: number,
    devise: string = DEVISE_PIVOT,
  ): Money {
    return Money.of(centimes / 100, devise);
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle.
   *
   * Le driver Postgres rend les colonnes `decimal` en chaînes ; c'est la seule
   * porte qui l'accepte, et elle ne rejoue pas les invariants — une ligne déjà
   * écrite l'a été par `of` (cf. `CodePays` dans `compliance`).
   */
  static restore(montant: number | string, devise: string): Money {
    return new Money(round2(Number(montant)), Money.normaliser(devise));
  }

  // ── Arithmétique ──────────────────────────────────────────────────────────

  /** @throws DeviseIncoherenteError si les deux sommes ne sont pas comparables. */
  plus(autre: Money): Money {
    this.exigerLaMemeDevise(autre);
    return new Money(round2(this._montant + autre._montant), this._devise);
  }

  /**
   * @throws DeviseIncoherenteError si les deux sommes ne sont pas comparables.
   * @throws MontantInvalideError si le résultat passerait sous zéro — c'est le
   *   VO, et non l'agrégat, qui rend le solde débiteur inexprimable. `Wallet`
   *   lève quand même sa propre `SoldeInsuffisantError` en amont : elle porte
   *   le solde et le montant demandé, donc un message que l'investisseur peut
   *   lire, là où celle-ci ne serait qu'un garde-fou de dernier recours.
   */
  moins(autre: Money): Money {
    this.exigerLaMemeDevise(autre);
    return Money.of(round2(this._montant - autre._montant), this._devise);
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /** Cette somme suffit-elle à en couvrir une autre ? */
  couvre(autre: Money): boolean {
    this.exigerLaMemeDevise(autre);
    return this._montant >= autre._montant;
  }

  /** Un mouvement doit être strictement positif : créditer zéro n'est rien. */
  estPositif(): boolean {
    return this._montant > 0;
  }

  estNul(): boolean {
    return this._montant === 0;
  }

  /** Deux sommes égales en montant **et** en devise. */
  equals(autre: Money): boolean {
    return this._montant === autre._montant && this._devise === autre._devise;
  }

  estDansLaDevise(devise: string): boolean {
    return this._devise === Money.normaliser(devise);
  }

  get montant(): number {
    return this._montant;
  }

  get devise(): string {
    return this._devise;
  }

  /** Vers la plus petite unité — ce que les appels Stripe attendent. */
  enCentimes(): number {
    return Math.round(this._montant * 100);
  }

  toSnapshot(): MoneySnapshot {
    return { montant: this._montant, devise: this._devise };
  }

  /**
   * `1 234,56 €` — la forme lisible, pour les notifications et les messages
   * d'erreur. Elle passe par `formatEur`, qui ne sait faire que l'euro : une
   * somme dans une autre devise sort donc en `montant + code`, plutôt que
   * d'être affichée faussement comme des euros.
   */
  toString(): string {
    return this._devise === DEVISE_PIVOT
      ? formatEur(this._montant)
      : `${this._montant.toFixed(2)} ${this._devise}`;
  }

  // ── Règles internes ───────────────────────────────────────────────────────

  /** `eur`, `EUR` et `Eur` désignent la même devise ; la table stocke `EUR`. */
  private static normaliser(devise: string): string {
    return devise.trim().toUpperCase();
  }

  private exigerLaMemeDevise(autre: Money): void {
    if (this._devise !== autre._devise) {
      throw new DeviseIncoherenteError(this._devise, autre._devise);
    }
  }
}
