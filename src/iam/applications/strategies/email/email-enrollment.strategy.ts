import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { AuthMailerService } from 'src/iam/applications/services/auth-mailer.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { UserNotFoundError } from 'src/iam/domains/errors';
import { ChannelEnrollmentStrategy } from '../channel/channel-enrollment.strategy';
import { MfaEnrollmentRequest } from '../mfa/mfa-enrollment.strategy';

/**
 * Enrôlement du canal email. La destination n'est **pas** prise dans le body :
 * c'est l'adresse du compte, lue en base. Accepter une adresse arbitraire
 * reviendrait à laisser déplacer le second facteur vers une boîte tierce
 * depuis une simple session valide.
 */
@Injectable()
export class EmailEnrollmentStrategy extends ChannelEnrollmentStrategy {
  readonly method = MfaMethodType.EMAIL;

  constructor(
    otpService: OtpService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    private readonly authMailer: AuthMailerService,
  ) {
    super(otpService, userRepository);
  }

  protected async resolveCredential(
    request: MfaEnrollmentRequest,
  ): Promise<string> {
    const user = await this.userRepository.findById(request.userId);
    if (!user) throw new UserNotFoundError();
    return user.email;
  }

  protected deliver(credential: string, otp: string): Promise<void> {
    return this.authMailer.sendLoginOtp(credential, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par email. Réessayez dans un instant.";
  }
}
