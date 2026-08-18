import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { AuthMailerService } from 'src/iam/applications/services/auth-mailer.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { ChannelChallengeStrategy } from '../channel/channel-challenge.strategy';

/** Vérification du facteur email : le code repart à l'adresse enrôlée. */
@Injectable()
export class EmailChallengeStrategy extends ChannelChallengeStrategy {
  readonly method = MfaMethodType.EMAIL;

  constructor(
    otpService: OtpService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    private readonly authMailer: AuthMailerService,
  ) {
    super(otpService, userRepository);
  }

  protected deliver(credential: string, otp: string): Promise<void> {
    return this.authMailer.sendLoginOtp(credential, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par email. Réessayez dans un instant.";
  }
}
