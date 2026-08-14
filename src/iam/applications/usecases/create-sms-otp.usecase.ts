import { Inject, Injectable, Logger } from '@nestjs/common';
import { OTP_STORE, type OtpStore } from 'src/iam/applications/ports/otp-store.port';
import { SMS_SERVICE, type SmsService } from 'src/shared/sms/sms.service';
import {
  InvalidPhoneNumberError,
  OtpAlreadyActiveError,
  OtpDeliveryFailedError,
} from 'src/iam/domains/errors';

/** Normalise le numéro en une clé de cache stable (espaces retirés). */
const normalize = (p: string): string => p.replace(/\s+/g, '').trim();

const smsOtpKey = (phone: string): string => `otp:sms:${phone}`;

@Injectable()
export class CreateSmsOtpUseCase {
  private readonly logger = new Logger(CreateSmsOtpUseCase.name);

  constructor(
    @Inject(OTP_STORE) private readonly otpStore: OtpStore,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {}

  async send(rawPhone: string): Promise<void> {
    const phone = normalize(rawPhone);
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new InvalidPhoneNumberError();
    }

    const key = smsOtpKey(phone);
    const hasActive = await this.otpStore.hasActiveOtp(key);
    if (hasActive) {
      throw new OtpAlreadyActiveError(
        'Un code est déjà actif sur ce numéro, veuillez patienter.',
      );
    }

    const otp = await this.otpStore.generateOtp(key);

    try {
      await this.smsService.sendOtp(phone, otp);
    } catch (err) {
      // Si l'envoi SMS échoue, on invalide l'OTP en cache pour permettre
      // une nouvelle tentative immédiate (sinon l'utilisateur reste
      // bloqué pendant tout le TTL alors qu'il n'a jamais reçu de SMS).
      await this.otpStore.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du SMS OTP à ${phone} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new OtpDeliveryFailedError(
        "Impossible d'envoyer le code par SMS. Réessayez dans un instant.",
        err,
      );
    }
  }

  async verify(rawPhone: string, otp: string): Promise<boolean> {
    return this.otpStore.verifyOtp(smsOtpKey(normalize(rawPhone)), otp);
  }
}
