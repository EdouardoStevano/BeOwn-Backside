import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { OTP_STORE, type OtpStore } from 'src/iam/applications/ports/otp-store.port';
import {
  AUTH_MAILER,
  type AuthMailer,
} from 'src/iam/applications/ports/auth-mailer.port';
import {
  EMAIL_METHOD_REPOSITORY,
  type ChannelTfaMethodRepository,
} from 'src/iam/domains/ports/channel-tfa-method.repository';
import { ChannelChallengeStrategy } from './channel-challenge.strategy';

/** Vérification du facteur email : le code repart à l'adresse enrôlée. */
@Injectable()
export class EmailChallengeStrategy extends ChannelChallengeStrategy {
  readonly method = TfaMethodType.EMAIL;

  constructor(
    @Inject(OTP_STORE) otpStore: OtpStore,
    @Inject(EMAIL_METHOD_REPOSITORY)
    methodRepository: ChannelTfaMethodRepository,
    @Inject(AUTH_MAILER) private readonly authMailer: AuthMailer,
  ) {
    super(otpStore, methodRepository);
  }

  protected deliver(target: string, otp: string): Promise<void> {
    return this.authMailer.sendLoginOtp(target, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par email. Réessayez dans un instant.";
  }

  /** `jean.dupont@example.com` → `j***t@example.com`. */
  protected mask(target: string): string {
    const [local, domain] = target.split('@');
    if (!domain) return '***';
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }
}
