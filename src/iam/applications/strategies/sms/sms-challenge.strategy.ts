import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { SMS_SERVICE, type SmsService } from 'src/shared/sms/sms.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { ChannelChallengeStrategy } from '../channel/channel-challenge.strategy';

/** Vérification du facteur SMS : le code repart au numéro enrôlé. */
@Injectable()
export class SmsChallengeStrategy extends ChannelChallengeStrategy {
  readonly method = MfaMethodType.SMS;

  constructor(
    otpService: OtpService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {
    super(otpService, userRepository);
  }

  protected deliver(credential: string, otp: string): Promise<void> {
    return this.smsService.sendOtp(credential, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par SMS. Réessayez dans un instant.";
  }
}
