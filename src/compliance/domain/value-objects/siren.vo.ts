import { ChampProfilInvalideError } from 'src/compliance/domain/errors';

/** Le SIREN identifie l'entreprise sur exactement 9 chiffres. */
const LONGUEUR = 9;

const LABEL = 'Le SIREN';
const FIELD = 'siren';

/**
 * Numéro SIREN de l'entreprise.
 *
 * Le DTO n'exigeait qu'une chaîne : « 123456789 », « à compléter » ou un
 * SIRET de 14 chiffres passaient et finissaient en base. Or ce numéro est la
 * clé de tous les rapprochements externes — vérification au RNE, contrôle
 * LCB-FT sur la personne morale, génération du DBE-S1 — et une erreur n'y
 * apparaît qu'au moment où l'un d'eux échoue, sur un dossier qu'on croyait
 * complet.
 *
 * La **clé de contrôle de Luhn** est vérifiée, et c'est tout l'intérêt : elle
 * n'accepte qu'un numéro sur dix, donc elle attrape la quasi-totalité des
 * fautes de frappe et des chiffres intervertis. Contrairement à une clé
 * fiscale étrangère, l'algorithme est public, stable et sans exception pour le
 * SIREN — on peut s'y fier sans risquer de bloquer une entreprise en règle.
 *
 * Elle ne prouve pas pour autant que l'entreprise existe : seul un appel au
 * registre le dirait. Ce VO écarte l'objectivement faux, pas l'inexistant.
 */
export class Siren {
  private constructor(readonly value: string) {}

  /**
   * Les séparateurs de confort sont retirés avant contrôle : les extraits
   * Kbis écrivent le SIREN par groupes de trois (« 404 833 048 »), et le
   * stocker sous deux formes compterait deux entreprises au lieu d'une.
   */
  static of(raw: string | null | undefined): Siren | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est invalide.', FIELD);
    }

    const normalized = raw.replace(/[\s.-]/g, '');
    if (normalized.length === 0) return null;

    if (!/^\d+$/.test(normalized)) {
      throw new ChampProfilInvalideError(
        LABEL,
        'ne doit contenir que des chiffres.',
        FIELD,
      );
    }
    if (normalized.length !== LONGUEUR) {
      // Le cas le plus fréquent est un SIRET (14 chiffres) saisi à la place :
      // le dire évite un aller-retour avec le support.
      const precision =
        normalized.length === 14
          ? ` — ${normalized.length} chiffres correspondent à un SIRET, pas à un SIREN`
          : '';
      throw new ChampProfilInvalideError(
        LABEL,
        `doit contenir exactement ${LONGUEUR} chiffres${precision}.`,
        FIELD,
      );
    }
    if (!cleDeLuhnValide(normalized)) {
      throw new ChampProfilInvalideError(
        LABEL,
        'est mal formé : sa clé de contrôle est incorrecte, vérifiez la saisie.',
        FIELD,
      );
    }

    return new Siren(normalized);
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle. Réservé aux mappers :
   * une ligne écrite avant que la règle n'existe doit rester lisible. Refuser
   * au chargement rendrait le profil inaccessible — y compris pour corriger le
   * numéro fautif.
   */
  static restore(raw: string | null): Siren | null {
    return raw === null ? null : new Siren(raw);
  }

  /** Égalité par valeur — un VO n'a pas d'identité. */
  equals(other: Siren | null | undefined): boolean {
    return other instanceof Siren && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

/**
 * Clé de Luhn telle que l'INSEE l'applique au SIREN : on double un chiffre sur
 * deux en partant du second, on retranche 9 au-delà de 9, et la somme doit être
 * un multiple de 10.
 */
function cleDeLuhnValide(siren: string): boolean {
  let somme = 0;
  for (let position = 0; position < siren.length; position += 1) {
    let chiffre = Number(siren[position]);
    // Positions impaires en base 0 = 2e, 4e, 6e, 8e chiffre.
    if (position % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}
