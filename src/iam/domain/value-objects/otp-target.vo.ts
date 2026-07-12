import { InvalidPhoneNumberError } from '../errors/iam.errors';

export enum OtpChannel {
  EMAIL = 'email',
  SMS = 'sms',
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Destinataire d'un code à usage unique : une adresse email ou un numéro de
 * téléphone, normalisé et validé à la construction.
 *
 * Le VO porte aussi sa propre clé de stockage : impossible qu'un appelant
 * construise « otp:sms:06 12 34 56 78 » d'un côté et « otp:sms:+33612345678 »
 * de l'autre, et se retrouve à ne jamais retrouver le code qu'il a écrit.
 */
export class OtpTarget {
  private constructor(
    readonly channel: OtpChannel,
    readonly value: string,
  ) {}

  static email(email: string): OtpTarget {
    return new OtpTarget(OtpChannel.EMAIL, email.toLowerCase().trim());
  }

  static phone(phone: string): OtpTarget {
    const normalized = phone.replace(/\s+/g, '').trim();
    if (!E164.test(normalized)) {
      throw new InvalidPhoneNumberError();
    }
    return new OtpTarget(OtpChannel.SMS, normalized);
  }

  /** Clé de stockage. Format inchangé : les codes déjà en cache restent valides. */
  get storageKey(): string {
    return `otp:${this.channel}:${this.value}`;
  }
}
