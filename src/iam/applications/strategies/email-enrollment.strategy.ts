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
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { UserNotFoundError } from 'src/iam/domains/errors';
import { ChannelEnrollmentStrategy } from './channel-enrollment.strategy';
import { TfaEnrollmentRequest } from './tfa-enrollment.strategy';

/**
 * Enrôlement du canal email. La destination n'est **pas** prise dans le body :
 * c'est l'adresse du compte, lue en base. Accepter une adresse arbitraire
 * reviendrait à laisser déplacer le second facteur vers une boîte tierce
 * depuis une simple session valide.
 */
@Injectable()
export class EmailEnrollmentStrategy extends ChannelEnrollmentStrategy {
  readonly method = TfaMethodType.EMAIL;

  constructor(
    @Inject(OTP_STORE) otpStore: OtpStore,
    @Inject(EMAIL_METHOD_REPOSITORY)
    methodRepository: ChannelTfaMethodRepository,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTH_MAILER) private readonly authMailer: AuthMailer,
  ) {
    super(otpStore, methodRepository);
  }

  protected async resolveTarget(
    request: TfaEnrollmentRequest,
  ): Promise<string> {
    const user = await this.userRepository.findById(request.userId);
    if (!user) throw new UserNotFoundError();
    return user.email;
  }

  protected deliver(target: string, otp: string): Promise<void> {
    return this.authMailer.sendLoginOtp(target, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par email. Réessayez dans un instant.";
  }
}
