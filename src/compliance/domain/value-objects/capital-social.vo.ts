import { ChampProfilInvalideError } from 'src/compliance/domain/errors';

/**
 * Borne haute : le plus grand entier que JavaScript représente exactement.
 *
 * La colonne, un `decimal(18, 2)`, en accepterait davantage — mais au-delà de
 * 2^53 un `number` ne distingue plus deux montants voisins, et le domaine
 * écrirait alors une valeur qui n'est pas celle qu'on lui a donnée. Le vrai
 * plafond est celui du type, pas celui de la colonne ; il laisse de la marge
 * pour tout capital social réel (neuf millions de milliards d'euros).
 */
const MAX = Number.MAX_SAFE_INTEGER;

/** La colonne retient deux décimales ; au-delà, la valeur serait tronquée. */
const DECIMALES = 2;

const LABEL = 'Le capital social';
const FIELD = 'capitalSocial';

/**
 * Capital social déclaré, en euros.
 *
 * Le DTO ne posait aucune contrainte — pas même `@IsNumber`, la propriété
 * n'ayant que `@IsOptional` : une chaîne, un nombre négatif ou `Infinity`
 * traversaient jusqu'à la base. Un capital négatif n'existe pas en droit des
 * sociétés, et un `NaN` en colonne décimale fait échouer toute agrégation
 * ultérieure.
 *
 * **Zéro est accepté** : les SAS et SARL peuvent légalement être constituées
 * au capital d'un euro, et rien n'interdit de déclarer un capital non encore
 * libéré. Ce n'est pas au profil d'exiger un plancher que la loi ne pose pas.
 */
export class CapitalSocial {
  private constructor(readonly value: number) {}

  /**
   * Accepte aussi une chaîne : c'est sous cette forme que le driver Postgres
   * rend une colonne `decimal`, et qu'un formulaire mal typé peut l'envoyer.
   */
  static of(raw: number | string | null | undefined): CapitalSocial | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string' && raw.trim().length === 0) return null;

    const valeur = typeof raw === 'number' ? raw : Number(raw);

    if (!Number.isFinite(valeur)) {
      throw new ChampProfilInvalideError(
        LABEL,
        'doit être un montant numérique.',
        FIELD,
      );
    }
    if (valeur < 0) {
      throw new ChampProfilInvalideError(
        LABEL,
        'ne peut pas être négatif.',
        FIELD,
      );
    }
    if (valeur > MAX) {
      throw new ChampProfilInvalideError(
        LABEL,
        'dépasse le montant maximal enregistrable.',
        FIELD,
      );
    }

    // Arrondi plutôt que refus : trois décimales sont une conversion de devise
    // maladroite, pas une faute de l'utilisateur. La colonne n'en garde que
    // deux de toute façon — autant que le domaine et la base disent la même
    // valeur.
    return new CapitalSocial(
      Math.round(valeur * 10 ** DECIMALES) / 10 ** DECIMALES,
    );
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle (cf. `Siren`). La
   * conversion depuis la chaîne du driver reste nécessaire : sans elle, le
   * domaine exposerait un `string` là où son type annonce un `number`.
   */
  static restore(raw: number | string | null): CapitalSocial | null {
    if (raw === null || raw === undefined) return null;
    const valeur = typeof raw === 'number' ? raw : Number(raw);
    // Une valeur illisible vaut « non renseigné » plutôt qu'un `NaN` qui se
    // propagerait dans les agrégats.
    return Number.isFinite(valeur) ? new CapitalSocial(valeur) : null;
  }

  equals(other: CapitalSocial | null | undefined): boolean {
    return other instanceof CapitalSocial && other.value === this.value;
  }

  toJSON(): number {
    return this.value;
  }
}
