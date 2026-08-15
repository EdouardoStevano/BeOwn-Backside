import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { AuthMailerService } from 'src/iam/applications/services/auth-mailer.service';
import {
  MFA_METHOD_REPOSITORY,
  type MfaMethodRepository,
} from 'src/iam/domains/ports/mfa-method.repository';
import { ChannelChallengeStrategy } from '../channel/channel-challenge.strategy';

/** Vérification du facteur email : le code repart à l'adresse enrôlée. */
@Injectable()
export class EmailChallengeStrategy extends ChannelChallengeStrategy {
  readonly method = MfaMethodType.EMAIL;

  constructor(
    otpService: OtpService,
    @Inject(MFA_METHOD_REPOSITORY)
    methodRepository: MfaMethodRepository,
    private readonly authMailer: AuthMailerService,
  ) {
    super(otpService, methodRepository);
  }

  protected deliver(credential: string, otp: string): Promise<void> {
    return this.authMailer.sendLoginOtp(credential, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par email. Réessayez dans un instant.";
  }
}
