import { ChampProfilInvalideError } from 'src/compliance/domain/errors';

/**
 * ISO 3166-1 alpha-2 — la liste officielle des codes attribués.
 *
 * Le DTO se contentait de `@Length(2, 2)` : « ZZ », « XX » ou « 42 » passaient
 * et finissaient en base. Or ces codes ne sont pas décoratifs — la nationalité
 * et la résidence fiscale alimentent le contrôle LCB-FT (pays à risque) et la
 * déclaration fiscale ; un code inexistant fait échouer ces traitements bien
 * plus tard, sur un dossier qu'on croyait complet.
 *
 * La liste est figée ici plutôt qu'importée d'un paquet npm : elle bouge une
 * fois par décennie, et le domaine ne dépend de rien (§1).
 */
const CODES_ISO_3166_1_ALPHA_2 = new Set(
  (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
    'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
    'DE DJ DK DM DO DZ ' +
    'EC EE EG EH ER ES ET ' +
    'FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
    'HK HM HN HR HT HU ' +
    'ID IE IL IM IN IO IQ IR IS IT ' +
    'JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ ' +
    'LA LB LC LI LK LR LS LT LU LV LY ' +
    'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
    'NA NC NE NF NG NI NL NO NP NR NU NZ ' +
    'OM ' +
    'PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
    'QA ' +
    'RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
    'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
    'UA UG UM US UY UZ ' +
    'VA VC VE VG VI VN VU ' +
    'WF WS ' +
    'YE YT ' +
    'ZA ZM ZW'
  ).split(' '),
);

/**
 * Code pays ISO 3166-1 alpha-2 — nationalité, pays de résidence, pays de
 * naissance, résidence fiscale.
 *
 * Un seul VO pour ces quatre champs : ils portent des rôles métier distincts
 * mais exactement la même règle de validité. En dupliquer quatre variantes
 * n'apporterait aucune sécurité de typage utile ici, et multiplierait par
 * quatre le coût d'une correction de la liste.
 */
export class CodePays {
  private constructor(readonly value: string) {}

  /**
   * `null` et chaîne vide disent tous deux « non renseigné » : le formulaire
   * de complétion est progressif, un champ pays vide n'est pas une faute.
   *
   * La casse est normalisée avant contrôle — un front qui envoie « fr » a
   * raison sur le fond, et refuser la saisie pour une majuscule enverrait
   * l'utilisateur chercher une faute qui n'existe pas.
   */
  static of(
    raw: string | null | undefined,
    label: string,
    field: string,
  ): CodePays | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(label, 'est invalide.', field);
    }

    const normalized = raw.trim().toUpperCase();
    if (normalized.length === 0) return null;

    if (!CODES_ISO_3166_1_ALPHA_2.has(normalized)) {
      throw new ChampProfilInvalideError(
        label,
        "doit être un code pays ISO 3166-1 alpha-2 valide (exemple : 'FR').",
        field,
      );
    }

    return new CodePays(normalized);
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle. Réservé aux mappers :
   * une ligne écrite avant que la règle n'existe doit rester lisible. Refuser
   * au chargement rendrait le profil inaccessible — y compris pour corriger le
   * code fautif.
   */
  static restore(raw: string | null): CodePays | null {
    return raw === null ? null : new CodePays(raw);
  }

  /** Égalité par valeur — un VO n'a pas d'identité. */
  equals(other: CodePays | null | undefined): boolean {
    return other instanceof CodePays && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
