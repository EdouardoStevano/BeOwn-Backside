import { TwoFactorMethod } from './enums/user.enum';
import {
  InvalidEmailError,
  InvalidPhoneNumberError,
  InvalidTotpSecretError,
} from './errors/user.errors';
import { EMAIL_PATTERN } from './value-objects/user-email.vo';

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Ce que produit otplib : du base32 (A–Z, 2–7), padding « = » éventuel. */
const BASE32_PATTERN = /^[A-Z2-7]{16,}=*$/;

/**
 * Une méthode de second facteur enrôlée sur un compte.
 *
 * `isActive` ne dit pas « c'est la méthode choisie » mais « l'utilisateur a
 * prouvé qu'il pouvait recevoir un code par ce canal » : une méthode est créée
 * inactive au moment de l'enrôlement, et n'est activée qu'une fois un premier
 * code vérifié. Le choix, lui, vit dans UserPreferences.twoFactorMethod — on ne
 * peut donc pas se verrouiller hors de son compte en sélectionnant un canal
 * qu'on ne contrôle pas.
 *
 * Chaque canal valide et normalise son credential à la construction (`create`) :
 * un numéro invalide est rejeté à l'enrôlement, pas découvert au moment du
 * challenge. `restore` reconstitue depuis la persistance sans rejouer les
 * règles — une ligne historique au format douteux ne doit pas rendre le compte
 * illisible.
 */
export abstract class TfaMethod {
  tfaMethodId: number;
  isActive = false;
  activatedDate: Date;

  abstract readonly method: TwoFactorMethod;

  /**
   * Ce qui permet de challenger l'utilisateur sur ce canal : une adresse, un
   * numéro, ou un secret TOTP. Le vocabulaire est volontairement neutre — c'est
   * IAM qui sait quoi en faire.
   */
  abstract get credential(): string;

  activate(at: Date = new Date()): void {
    this.isActive = true;
    this.activatedDate = at;
  }

  deactivate(): void {
    this.isActive = false;
  }
}

export class SmsMethod extends TfaMethod {
  readonly method = TwoFactorMethod.SMS;

  private constructor(readonly phoneNumberOtp: string) {
    super();
  }

  /**
   * Même normalisation que le challenge SMS d'IAM (OtpTarget.phone) : le numéro
   * stocké ici et la clé du code envoyé doivent désigner la même chose.
   */
  static create(phoneNumber: string): SmsMethod {
    const normalized = phoneNumber.replace(/\s+/g, '');
    if (!E164_PATTERN.test(normalized)) {
      throw new InvalidPhoneNumberError(phoneNumber);
    }
    return new SmsMethod(normalized);
  }

  static restore(phoneNumber: string): SmsMethod {
    return new SmsMethod(phoneNumber);
  }

  get credential(): string {
    return this.phoneNumberOtp;
  }
}

export class EmailMethod extends TfaMethod {
  readonly method = TwoFactorMethod.EMAIL;

  private constructor(readonly emailOtp: string) {
    super();
  }

  static create(email: string): EmailMethod {
    const normalized = email.toLowerCase().trim();
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new InvalidEmailError(email);
    }
    return new EmailMethod(normalized);
  }

  static restore(email: string): EmailMethod {
    return new EmailMethod(email);
  }

  get credential(): string {
    return this.emailOtp;
  }
}

export class TotpMethod extends TfaMethod {
  readonly method = TwoFactorMethod.TOTP;

  private constructor(readonly secretKeyOtp: string) {
    super();
  }

  static create(secretKey: string): TotpMethod {
    const normalized = secretKey.trim();
    if (!BASE32_PATTERN.test(normalized)) {
      throw new InvalidTotpSecretError();
    }
    return new TotpMethod(normalized);
  }

  static restore(secretKey: string): TotpMethod {
    return new TotpMethod(secretKey);
  }

  get credential(): string {
    return this.secretKeyOtp;
  }
}

/** Enrôle un canal : construit la sous-classe qui valide son credential. */
export function createTfaMethod(
  method: TwoFactorMethod,
  credential: string,
): TfaMethod {
  switch (method) {
    case TwoFactorMethod.SMS:
      return SmsMethod.create(credential);
    case TwoFactorMethod.EMAIL:
      return EmailMethod.create(credential);
    case TwoFactorMethod.TOTP:
      return TotpMethod.create(credential);
  }
}
