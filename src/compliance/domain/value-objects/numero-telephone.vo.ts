import { ChampProfilInvalideError } from 'src/compliance/domain/errors';

/** Longueur du numéro national, indicatif compris — borne haute de l'E.164. */
const MAX_CHIFFRES = 15;

/**
 * En deçà, aucun plan de numérotation national n'attribue de ligne joignable.
 * Volontairement bas : certains petits États tiennent en 8 chiffres.
 */
const MIN_CHIFFRES = 8;

/** Séparateurs de confort qu'on retire avant tout contrôle. */
const SEPARATEURS = /[\s.\-()/]/g;

const LABEL = 'Le numéro de téléphone';
const CHAMP = 'telephone';

/**
 * Numéro de téléphone déclaré par le titulaire dans son dossier.
 *
 * Il appartient au **dossier**, avec le reste de ce que le titulaire déclare
 * de lui : c'est une coordonnée du même ordre que son adresse postale, et le
 * canal de rappel obligatoire du conseil PSFP (contact périodique des
 * investisseurs vulnérables). Il vit donc dans `Coordonnees`, aux côtés de
 * l'adresse, et suit le cycle de vie du dossier.
 *
 * Le DTO n'exige qu'une chaîne : « à demander » ou « 06 » passeraient sans ce
 * Value Object, et un numéro inexploitable rend la campagne de contact
 * silencieusement incomplète.
 *
 * **Pas de validation par pays.** Vérifier qu'un numéro respecte le plan de
 * numérotation de son indicatif suppose d'embarquer une base type
 * libphonenumber, qui vieillit et qu'il faudrait tenir à jour dans le domaine.
 * On écarte l'objectivement faux — trop court, trop long, autre chose que des
 * chiffres — et on laisse la preuve d'existence à ce qui la donne vraiment :
 * l'envoi d'un code.
 *
 * > Ce Value Object a vécu dans `iam`, du temps où le numéro était porté par
 * > le compte. Il lève désormais `ChampProfilInvalideError` comme les autres
 * > champs déclarés du dossier, de sorte qu'un formulaire mal rempli rende la
 * > même forme d'erreur quel que soit le champ fautif.
 */
export class NumeroTelephone {
  private constructor(readonly value: string) {}

  /**
   * Normalise vers l'E.164 quand l'intention internationale est explicite :
   * `00` en tête est la forme européenne du `+`, et les stocker différemment
   * ferait apparaître deux fois le même abonné. Un numéro national reste tel
   * quel — sans pays de référence, on ne peut pas lui inventer un indicatif.
   */
  static of(raw: string | null | undefined): NumeroTelephone | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est invalide.', CHAMP);
    }

    const compacte = raw.replace(SEPARATEURS, '');
    if (compacte.length === 0) return null;

    const international = compacte.startsWith('00')
      ? `+${compacte.slice(2)}`
      : compacte;

    const chiffres = international.startsWith('+')
      ? international.slice(1)
      : international;

    if (!/^\d+$/.test(chiffres)) {
      throw new ChampProfilInvalideError(
        LABEL,
        "ne doit contenir que des chiffres, éventuellement précédés d'un indicatif '+'.",
        CHAMP,
      );
    }
    if (chiffres.length < MIN_CHIFFRES || chiffres.length > MAX_CHIFFRES) {
      throw new ChampProfilInvalideError(
        LABEL,
        `doit contenir entre ${MIN_CHIFFRES} et ${MAX_CHIFFRES} chiffres.`,
        CHAMP,
      );
    }

    return new NumeroTelephone(international);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(raw: string | null): NumeroTelephone | null {
    return raw === null ? null : new NumeroTelephone(raw);
  }

  equals(other: NumeroTelephone | null | undefined): boolean {
    return other instanceof NumeroTelephone && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
