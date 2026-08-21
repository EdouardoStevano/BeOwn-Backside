import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';

/**
 * Ce à quoi un challenge donne droit une fois prouvé. Le champ existe pour
 * qu'un code obtenu dans un contexte ne serve pas dans un autre : un challenge
 * émis pour terminer une connexion ne doit pas pouvoir désactiver la MFA, et
 * réciproquement. C'est le même raisonnement que le claim `type` des tokens
 * email (cf. `EmailTokenPurpose`), qui avait justement été ajouté après qu'un
 * token de vérification pouvait être rejoué sur la réinitialisation.
 */
export enum MfaChallengePurpose {
  /** Second facteur d'une connexion : sa preuve délivre les tokens. */
  SIGN_IN = 'sign_in',
  /** Ré-authentification avant de retirer un facteur du compte. */
  DISABLE = 'disable',
}

/**
 * Preuve en attente : le mot de passe (ou la session) a déjà été validé, il
 * reste à démontrer la possession du second facteur.
 *
 * Volontairement hors base : un challenge vit quelques minutes et meurt, qu'il
 * soit prouvé ou abandonné. Il est porté par un store à TTL
 * (`MFAChallengeCacheService`), pas par une table à purger.
 */
export interface MfaChallenge {
  /** Identifiant opaque remis à l'appelant — la seule part qui circule. */
  id: string;
  userId: number;
  /** Canal sur lequel la preuve est attendue. */
  method: MfaMethodType;
  purpose: MfaChallengePurpose;
  /**
   * Destination du code lorsqu'il a fallu l'envoyer (email, SMS). Absente pour
   * TOTP, dont le code est calculé par l'application de l'utilisateur.
   */
  sentTo?: string;
  /**
   * Essais restants avant que le challenge ne soit détruit.
   *
   * Ni illimité ni unique. Illimité, la fenêtre de validité offrirait autant
   * d'essais qu'on veut sur un code à six chiffres ; unique, une faute de
   * frappe obligerait à refaire toute la connexion. Le compteur tient les deux
   * bouts.
   */
  attemptsLeft: number;
}

/** Essais accordés à l'émission. */
export const MFA_CHALLENGE_MAX_ATTEMPTS = 3;

/**
 * Ce qu'il faut fournir pour émettre un challenge — l'identifiant, le nombre
 * d'essais et l'échéance sont décidés par `MFAChallengeCacheService`.
 */
export type MfaChallengeDraft = Omit<MfaChallenge, 'id' | 'attemptsLeft'>;
