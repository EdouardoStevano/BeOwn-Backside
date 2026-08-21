import { InvalidTelephoneError } from 'src/iam/domain/errors/profile.errors';

/** Longueur du numéro national, indicatif compris — borne haute de l'E.164. */
const MAX_CHIFFRES = 15;

/**
 * En deçà, aucun plan de numérotation national n'attribue de ligne joignable.
 * Volontairement bas : certains petits États tiennent en 8 chiffres.
 */
const MIN_CHIFFRES = 8;

/** Séparateurs de confort qu'on retire avant tout contrôle. */
const SEPARATEURS = /[\s.\-()/]/g;

/**
 * Numéro de téléphone du titulaire du compte.
 *
 * Il vivait dans le contexte Profiles, sur le dossier investisseur, alors que
 * la colonne existait déjà — vide — nulle part ailleurs : c'est un moyen de
 * **joindre le compte**, pas une donnée réglementaire du dossier. Il a suivi
 * `prenom` et `nom` vers `user`, dont il partage le cycle de vie : un compte
 * sans profil a un numéro, un profil supprimé ne le fait pas disparaître.
 *
 * Le DTO n'exigeait qu'une chaîne : « à demander » ou « 06 » étaient acceptés
 * et stockés. C'est le canal de rappel obligatoire du conseil PSFP (§ contact
 * périodique des investisseurs vulnérables) — un numéro inexploitable rend la
 * campagne de contact silencieusement incomplète.
 *
 * **Pas de validation par pays.** Vérifier qu'un numéro respecte le plan de
 * numérotation de son indicatif suppose d'embarquer une base type
 * libphonenumber, qui vieillit et qu'il faudrait tenir à jour dans le domaine.
 * On écarte l'objectivement faux — trop court, trop long, autre chose que des
 * chiffres — et on laisse la preuve d'existence à ce qui la donne vraiment :
 * l'envoi d'un code.
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
      throw new InvalidTelephoneError('est invalide.');
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
      throw new InvalidTelephoneError(
        "ne doit contenir que des chiffres, éventuellement précédés d'un indicatif '+'.",
      );
    }
    if (chiffres.length < MIN_CHIFFRES || chiffres.length > MAX_CHIFFRES) {
      throw new InvalidTelephoneError(
        `doit contenir entre ${MIN_CHIFFRES} et ${MAX_CHIFFRES} chiffres.`,
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
