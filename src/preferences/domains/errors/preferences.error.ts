/**
 * Socle des erreurs métier du contexte Preferences.
 *
 * TypeScript pur : aucun import NestJS, aucune notion de statut HTTP (§12.1).
 * `PreferencesErrorFilter` traduit en réponse.
 *
 * Même socle recopié que `ProfilesError` et `IamError`. Le doublon est assumé
 * pour la même raison qu'eux : une classe de base partagée obligerait chaque
 * Bounded Context à dépendre d'un module commun qui grossirait à chaque
 * besoin — précisément ce que CRP (§5) demande d'éviter.
 */
export enum PreferencesErrorKind {
  /** L'état actuel interdit l'opération. */
  CONFLICT = 'CONFLICT',
  /** L'entrée fournie est invalide au regard d'une règle métier. */
  INVALID_INPUT = 'INVALID_INPUT',
}

export interface PreferencesErrorOptions {
  code?: string;
  details?: Record<string, unknown>;
}

export abstract class PreferencesError extends Error {
  abstract readonly kind: PreferencesErrorKind;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: PreferencesErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}

/** Langue hors de celles que la plateforme sert. */
export class LangueNonSupporteeError extends PreferencesError {
  readonly kind = PreferencesErrorKind.INVALID_INPUT;

  constructor(langues: readonly string[]) {
    super(`Langue non supportée : attendu ${langues.join(', ')}.`, {
      code: 'LANGUE_NON_SUPPORTEE',
      details: { field: 'langue' },
    });
  }
}

/**
 * On a tenté d'armer ou de désarmer la double authentification en écrivant une
 * préférence.
 *
 * `twoFactorEnabled` était un booléen librement modifiable par
 * `PATCH /users/me/preferences/mfa`, **que personne ne lisait** : la connexion
 * interroge les facteurs réellement enrôlés (`MfaFactorService`), jamais cette
 * colonne. Le titulaire actionnait donc un interrupteur sans effet, en croyant
 * protéger ou déverrouiller son compte.
 *
 * Armer un facteur exige de vérifier un code (`POST /auth/mfa/enroll` puis
 * `/auth/mfa/enable`), le retirer exige de prouver une dernière fois qu'on le
 * possède (`POST /auth/mfa/disable`) — sans quoi une session volée suffirait à
 * désarmer le compte. Aucune de ces deux garanties ne tient dans un `PATCH` de
 * préférence : le champ devient donc lecture seule.
 */
export class MfaNonModifiableParPreferenceError extends PreferencesError {
  readonly kind = PreferencesErrorKind.CONFLICT;

  constructor() {
    super(
      "La double authentification ne se règle pas depuis les préférences : utilisez POST /auth/mfa/enroll pour l'activer, POST /auth/mfa/disable pour la retirer.",
      {
        code: 'MFA_NON_MODIFIABLE_PAR_PREFERENCE',
        details: { field: 'twoFactorEnabled' },
      },
    );
  }
}
