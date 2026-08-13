import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';

/**
 * Demande d'enrôlement d'un canal 2FA, indépendante du transport : le canal
 * visé est une **donnée** (`method`) et non plus un segment d'URL.
 */
export interface TfaEnrollmentRequest {
  method: TfaMethodType;
  userId: number;
  /** Adresse du compte — libellé du QR code TOTP, destination du canal email. */
  email: string;
  /** Destination du canal SMS. Ignoré par les autres canaux. */
  phone?: string;
}

/** Confirmation d'un enrôlement démarré : le code prouve la possession. */
export interface TfaEnrollmentConfirmation {
  method: TfaMethodType;
  userId: number;
  otp: string;
}

/**
 * Ce que l'enrôlement renvoie à l'appelant. Les champs sont volontairement
 * optionnels : chaque canal n'en remplit qu'une partie (TOTP rend un secret à
 * scanner, email/SMS se contentent d'annoncer la destination du code envoyé).
 */
export interface TfaEnrollmentChallenge {
  method: TfaMethodType;
  /** TOTP : secret partagé, pour la saisie manuelle. */
  secret?: string;
  /** TOTP : URI `otpauth://` à encoder en QR code. */
  uri?: string;
  /** Email/SMS : destination vers laquelle le code vient d'être envoyé. */
  sentTo?: string;
}

/**
 * Un canal d'enrôlement 2FA (pattern Strategy, §9).
 *
 * L'ancien parcours codait le canal dans la route (`POST /otp/totp/setup`) :
 * ajouter un canal imposait une route, un DTO et une branche de contrôleur.
 * Ici, le contrôleur ne connaît que ce contrat ; ajouter un canal se limite à
 * une nouvelle implémentation enregistrée dans `AuthenticationModule`
 * (§4 Open/Closed).
 */
export interface TfaEnrollmentStrategy {
  /** Canal couvert — sert de clé de résolution dans le registre. */
  readonly method: TfaMethodType;
  /** Démarre l'enrôlement : crée la méthode en attente et émet le défi. */
  start(request: TfaEnrollmentRequest): Promise<TfaEnrollmentChallenge>;
  /** Valide le défi et fait de la méthode l'unique méthode active du canal. */
  confirm(confirmation: TfaEnrollmentConfirmation): Promise<void>;
  /**
   * Ce canal a-t-il un enrôlement commencé mais pas confirmé ?
   *
   * C'est ce qui permet à `POST /auth/mfa/enable` de ne porter qu'un code :
   * le canal n'est pas redemandé à l'appelant, il est déduit de l'enrôlement
   * en attente. Chaque stratégie garantissant **au plus un** enrôlement en
   * attente (cf. `deletePendingForUser`), la déduction est sans ambiguïté.
   */
  hasPending(userId: number): Promise<boolean>;
}

/** Token du tableau de stratégies injecté dans `EnrollTfaUseCase`. */
export const TFA_ENROLLMENT_STRATEGIES = Symbol('TFA_ENROLLMENT_STRATEGIES');
