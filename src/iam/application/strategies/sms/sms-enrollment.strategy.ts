import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';
import { OtpService } from 'src/iam/application/services/otp/otp.service';
import { SMS_SERVICE, type SmsService } from 'src/shared/sms/sms.service';
import {
  InvalidPhoneNumberError,
  MissingPhoneNumberError,
} from 'src/iam/domain/errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { ChannelEnrollmentStrategy } from '../channel/channel-enrollment.strategy';
import { MfaEnrollmentRequest } from '../mfa/mfa-enrollment.strategy';

/** Normalise le numéro en une valeur stable (espaces retirés). */
const normalize = (phone: string): string => phone.replace(/\s+/g, '').trim();

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Enrôlement du canal SMS. Contrairement à l'email, la destination vient du
 * body : le compte ne porte pas de numéro de téléphone, c'est l'enrôlement
 * lui-même qui l'enregistre — et la confirmation du code qui le prouve.
 */
@Injectable()
export class SmsEnrollmentStrategy extends ChannelEnrollmentStrategy {
  readonly method = MfaMethodType.SMS;

  constructor(
    otpService: OtpService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {
    super(otpService, userRepository);
  }

  protected resolveCredential(request: MfaEnrollmentRequest): Promise<string> {
    if (!request.phone) throw new MissingPhoneNumberError();

    const phone = normalize(request.phone);
    if (!E164.test(phone)) throw new InvalidPhoneNumberError();

    return Promise.resolve(phone);
  }

  protected deliver(credential: string, otp: string): Promise<void> {
    return this.smsService.sendOtp(credential, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par SMS. Réessayez dans un instant.";
  }
}
