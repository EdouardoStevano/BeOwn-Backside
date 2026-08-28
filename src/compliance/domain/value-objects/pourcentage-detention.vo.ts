import { ChampProfilInvalideError } from 'src/compliance/domain/errors/champ-profil.errors';

/**
 * Part à partir de laquelle une personne est bénéficiaire effectif.
 *
 * Le cahier des charges le dit sans détour : *« la liste des actionnaires
 * possédant 25 % et plus des parts de la société »*. C'est aussi le seuil de la
 * directive LCB-FT et celui du formulaire DBE-S1. En deçà, la personne n'est
 * pas un bénéficiaire effectif — la déclarer ne servirait à rien et ferait
 * enfler un registre que le régulateur veut court.
 *
 * Il vivait dans un `@Min(25)` du DTO, c'est-à-dire dans la couche HTTP : la
 * règle ne valait que pour cette route, et un import ou un futur appelant
 * interne l'aurait contournée sans le savoir.
 */
export const SEUIL_BENEFICIAIRE_EFFECTIF = 25;

const LABEL = 'Le pourcentage de détention';
const CHAMP = 'pourcentageDetention';

/**
 * La part du capital qu'une personne détient dans la société.
 *
 * Bornée des deux côtés, et par le métier : en dessous de 25 % on n'est pas
 * bénéficiaire effectif, au-dessus de 100 % on détient plus que le capital.
 *
 * Arrondie au centième, comme la colonne `numeric(5,2)` qui la stocke : sans
 * cela, un `33.333…` déclaré ressortirait `33.33` de la base, et la somme
 * calculée à l'écriture ne serait pas celle relue.
 *
 * **Immuable** — cf. `Identite`. Corriger une part, c'est en poser une autre.
 */
export class PourcentageDetention {
  private constructor(readonly value: number) {}

  static of(raw: number | string | null | undefined): PourcentageDetention {
    if (raw === null || raw === undefined || raw === '') {
      throw new ChampProfilInvalideError(LABEL, 'est obligatoire.', CHAMP);
    }

    const part = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(part)) {
      throw new ChampProfilInvalideError(LABEL, 'doit être un nombre.', CHAMP);
    }
    if (part < SEUIL_BENEFICIAIRE_EFFECTIF) {
      throw new ChampProfilInvalideError(
        LABEL,
        `doit atteindre ${SEUIL_BENEFICIAIRE_EFFECTIF} % : en deçà, la personne n'est pas un bénéficiaire effectif.`,
        CHAMP,
      );
    }
    if (part > 100) {
      throw new ChampProfilInvalideError(
        LABEL,
        'ne peut pas dépasser 100 %.',
        CHAMP,
      );
    }

    return new PourcentageDetention(arrondiAuCentieme(part));
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(raw: number | string): PourcentageDetention {
    const part = typeof raw === 'number' ? raw : Number(raw);
    return new PourcentageDetention(
      Number.isFinite(part) ? arrondiAuCentieme(part) : 0,
    );
  }

  plus(autre: PourcentageDetention): PourcentageDetention {
    return new PourcentageDetention(
      arrondiAuCentieme(this.value + autre.value),
    );
  }

  depasse(limite: number): boolean {
    return this.value > limite;
  }

  toJSON(): number {
    return this.value;
  }
}

/** Deux décimales, comme la colonne — l'arithmétique flottante en ajoute. */
function arrondiAuCentieme(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}
