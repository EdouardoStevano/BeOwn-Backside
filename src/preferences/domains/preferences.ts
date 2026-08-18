import {
  LangueNonSupporteeError,
  MfaNonModifiableParPreferenceError,
} from './errors/preferences.error';

/** Langues servies par la plateforme. */
export const LANGUES_SUPPORTEES = ['fr', 'en', 'ar'] as const;
export type Langue = (typeof LANGUES_SUPPORTEES)[number];

export const LANGUE_PAR_DEFAUT: Langue = 'fr';
export const DEVISE_PAR_DEFAUT = 'EUR';

/**
 * Ce que le titulaire peut régler. `twoFactorEnabled` en est **absent** :
 * c'est tout l'objet de {@link MfaNonModifiableParPreferenceError}.
 */
export interface ChampsPreferences {
  langue?: string | null;
  masquerMontants?: boolean;
  notifEmail?: boolean;
  notifSms?: boolean;
  notifMarketing?: boolean;
  /** Refusé — présent dans le type pour pouvoir être refusé explicitement. */
  twoFactorEnabled?: boolean;
}

/** État complet, tel qu'il transite depuis/vers la persistance. */
export interface PreferencesSnapshot {
  utilisateurId: number;
  langue: string;
  masquerMontants: boolean;
  notifEmail: boolean;
  notifSms: boolean;
  notifMarketing: boolean;
  twoFactorEnabled: boolean;
  preferredCurrency: string;
}

/**
 * Réglages d'un titulaire : langue, affichage, canaux de notification.
 *
 * C'était une classe à champs publics sans le moindre comportement
 * (`iam/domains/models/user-preferences.ts`), écrite par
 * `userRepository.savePreferences(userId, dtoPartiel)` — c'est-à-dire par un
 * `Object.assign` sur la ligne, depuis six routes du contrôleur de compte.
 *
 * Deux règles y vivent désormais :
 *
 * - **la langue est bornée** à celles que la plateforme sert. Le DTO le
 *   vérifiait déjà, mais lui seul : un import ou un futur appelant interne
 *   aurait posé `de` sans que rien ne s'y oppose ;
 * - **`twoFactorEnabled` n'est pas un réglage** mais le reflet des facteurs
 *   réellement enrôlés. Il n'est plus modifiable ici.
 *
 * `undefined` signifie « ne pas toucher » — les six routes n'envoient qu'un
 * champ à la fois.
 */
export class Preferences {
  private readonly _utilisateurId: number;
  private _langue: Langue;
  private _masquerMontants: boolean;
  private _notifEmail: boolean;
  private _notifSms: boolean;
  private _notifMarketing: boolean;
  private readonly _twoFactorEnabled: boolean;
  private readonly _preferredCurrency: string;

  /** @internal Réservé à {@link Preferences.defaut} et au mapper. */
  constructor(etat: PreferencesSnapshot) {
    this._utilisateurId = etat.utilisateurId;
    this._langue = etat.langue as Langue;
    this._masquerMontants = etat.masquerMontants;
    this._notifEmail = etat.notifEmail;
    this._notifSms = etat.notifSms;
    this._notifMarketing = etat.notifMarketing;
    this._twoFactorEnabled = etat.twoFactorEnabled;
    this._preferredCurrency = etat.preferredCurrency;
  }

  /**
   * Réglages d'un titulaire qui n'en a jamais posé.
   *
   * Les valeurs reprennent les défauts de la colonne, à un détail près qui
   * compte : `notifEmail` vaut `true` — on prévient par défaut, et c'est le
   * titulaire qui se désinscrit — tandis que `notifMarketing` vaut `false`,
   * puisque la prospection se choisit (opt-in).
   */
  static defaut(utilisateurId: number): Preferences {
    return new Preferences({
      utilisateurId,
      langue: LANGUE_PAR_DEFAUT,
      masquerMontants: false,
      notifEmail: true,
      notifSms: false,
      notifMarketing: false,
      twoFactorEnabled: false,
      preferredCurrency: DEVISE_PAR_DEFAUT,
    });
  }

  /**
   * Applique les réglages déclarés. Atomique : tout est éprouvé avant la
   * moindre affectation, donc une langue refusée laisse le reste intact.
   *
   * @returns `true` si au moins un réglage a changé.
   */
  modifier(champs: ChampsPreferences): boolean {
    if (champs.twoFactorEnabled !== undefined) {
      throw new MfaNonModifiableParPreferenceError();
    }

    const langue =
      champs.langue === undefined || champs.langue === null
        ? this._langue
        : eprouverLangue(champs.langue);

    const change =
      langue !== this._langue ||
      estChange(champs.masquerMontants, this._masquerMontants) ||
      estChange(champs.notifEmail, this._notifEmail) ||
      estChange(champs.notifSms, this._notifSms) ||
      estChange(champs.notifMarketing, this._notifMarketing);

    this._langue = langue;
    this._masquerMontants = champs.masquerMontants ?? this._masquerMontants;
    this._notifEmail = champs.notifEmail ?? this._notifEmail;
    this._notifSms = champs.notifSms ?? this._notifSms;
    this._notifMarketing = champs.notifMarketing ?? this._notifMarketing;

    return change;
  }

  get utilisateurId(): number {
    return this._utilisateurId;
  }
  get langue(): Langue {
    return this._langue;
  }
  get masquerMontants(): boolean {
    return this._masquerMontants;
  }
  get notifEmail(): boolean {
    return this._notifEmail;
  }
  get notifSms(): boolean {
    return this._notifSms;
  }
  get notifMarketing(): boolean {
    return this._notifMarketing;
  }
  /** Reflet des facteurs enrôlés — voir `MfaNonModifiableParPreferenceError`. */
  get twoFactorEnabled(): boolean {
    return this._twoFactorEnabled;
  }
  get preferredCurrency(): string {
    return this._preferredCurrency;
  }

  /**
   * Les clés publiées sont exactement celles de la table — le front lit
   * `userId`, conservé tel quel plutôt que renommé en `utilisateurId`.
   */
  toJSON(): PreferencesSnapshot & { userId: number } {
    return {
      userId: this._utilisateurId,
      utilisateurId: this._utilisateurId,
      langue: this._langue,
      masquerMontants: this._masquerMontants,
      notifEmail: this._notifEmail,
      notifSms: this._notifSms,
      notifMarketing: this._notifMarketing,
      twoFactorEnabled: this._twoFactorEnabled,
      preferredCurrency: this._preferredCurrency,
    };
  }
}

function eprouverLangue(raw: string): Langue {
  const langue = raw.trim().toLowerCase();
  if (!(LANGUES_SUPPORTEES as readonly string[]).includes(langue)) {
    throw new LangueNonSupporteeError(LANGUES_SUPPORTEES);
  }
  return langue as Langue;
}

/** `undefined` = non déclaré, donc pas un changement. */
function estChange(saisie: boolean | undefined, actuelle: boolean): boolean {
  return saisie !== undefined && saisie !== actuelle;
}
