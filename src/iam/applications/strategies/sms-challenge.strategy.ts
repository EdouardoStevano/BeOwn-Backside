import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { OTP_STORE, type OtpStore } from 'src/iam/applications/ports/otp-store.port';
import { SMS_SERVICE, type SmsService } from 'src/shared/sms/sms.service';
import {
  SMS_METHOD_REPOSITORY,
  type ChannelTfaMethodRepository,
} from 'src/iam/domains/ports/channel-tfa-method.repository';
import { ChannelChallengeStrategy } from './channel-challenge.strategy';

/** Vérification du facteur SMS : le code repart au numéro enrôlé. */
@Injectable()
export class SmsChallengeStrategy extends ChannelChallengeStrategy {
  readonly method = TfaMethodType.SMS;

  constructor(
    @Inject(OTP_STORE) otpStore: OtpStore,
    @Inject(SMS_METHOD_REPOSITORY)
    methodRepository: ChannelTfaMethodRepository,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {
    super(otpStore, methodRepository);
  }

  protected deliver(target: string, otp: string): Promise<void> {
    return this.smsService.sendOtp(target, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par SMS. Réessayez dans un instant.";
  }

  /** `+33612345678` → `+33******78` : l'indicatif et la fin suffisent. */
  protected mask(target: string): string {
    if (target.length <= 5) return '***';
    return `${target.slice(0, 3)}${'*'.repeat(target.length - 5)}${target.slice(-2)}`;
  }
}
