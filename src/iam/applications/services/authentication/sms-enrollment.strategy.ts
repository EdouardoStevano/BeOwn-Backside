import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { OTP_STORE, type OtpStore } from 'src/iam/domains/ports/otp-store.port';
import { SMS_SERVICE, type SmsService } from 'src/common/sms/sms.service';
import {
  SMS_METHOD_REPOSITORY,
  type ChannelTfaMethodRepository,
} from 'src/iam/domains/ports/channel-tfa-method.repository';
import {
  InvalidPhoneNumberError,
  MissingPhoneNumberError,
} from 'src/iam/domains/errors';
import { ChannelEnrollmentStrategy } from './channel-enrollment.strategy';
import { TfaEnrollmentRequest } from './tfa-enrollment.strategy';

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
  readonly method = TfaMethodType.SMS;

  constructor(
    @Inject(OTP_STORE) otpStore: OtpStore,
    @Inject(SMS_METHOD_REPOSITORY)
    methodRepository: ChannelTfaMethodRepository,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {
    super(otpStore, methodRepository);
  }

  protected resolveTarget(request: TfaEnrollmentRequest): Promise<string> {
    if (!request.phone) throw new MissingPhoneNumberError();

    const phone = normalize(request.phone);
    if (!E164.test(phone)) throw new InvalidPhoneNumberError();

    return Promise.resolve(phone);
  }

  protected deliver(target: string, otp: string): Promise<void> {
    return this.smsService.sendOtp(target, otp);
  }

  protected deliveryFailureMessage(): string {
    return "Impossible d'envoyer le code par SMS. Réessayez dans un instant.";
  }
}
