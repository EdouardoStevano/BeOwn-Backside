import { IamError, IamErrorKind } from './iam.error';

/**
 * Erreurs des réglages du titulaire.
 *
 * Elles portaient leur propre socle — `PreferencesError`, `PreferencesErrorKind`
 * — recopié d'`IamError` à l'époque où les préférences étaient un Bounded
 * Context séparé. Ce doublon se justifiait alors par CRP (§5) : deux contextes
 * distincts ne partagent pas une classe de base. Les préférences ayant rejoint
 * `identity`, la justification tombe — un contexte n'a qu'un vocabulaire
 * d'erreurs, et `IamErrorFilter` le traduit déjà.
 *
 * Les deux `kind` retenus se mappent sur les mêmes statuts qu'avant (409 et
 * 400) et le corps de réponse est celui, identique, que produisait
 * `PreferencesErrorFilter` : les appelants ne voient aucune différence.
 */

/** Langue hors de celles que la plateforme sert. */
export class LangueNonSupporteeError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;

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
export class MfaNonModifiableParPreferenceError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;

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
