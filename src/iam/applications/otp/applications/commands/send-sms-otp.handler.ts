import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import { SMS_SERVICE, type SmsService } from 'src/common/sms/sms.service';
import { SendSmsOtpCommand } from './send-sms-otp.command';
import { normalizePhone, smsOtpKey } from './otp-keys';

@CommandHandler(SendSmsOtpCommand)
export class SendSmsOtpHandler implements ICommandHandler<SendSmsOtpCommand> {
  private readonly logger = new Logger(SendSmsOtpHandler.name);

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {}

  async execute(command: SendSmsOtpCommand): Promise<void> {
    const phone = normalizePhone(command.phone);
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new BadRequestException(
        'Numéro de téléphone invalide (format E.164 attendu, ex: +33612345678).',
      );
    }

    const key = smsOtpKey(phone);
    const hasActive = await this.otpService.hasActiveOtp(key);
    if (hasActive) {
      throw new BadRequestException(
        'Un code est déjà actif sur ce numéro, veuillez patienter.',
      );
    }

    const otp = await this.otpService.generateOtp(key);

    try {
      await this.smsService.sendOtp(phone, otp);
    } catch (err) {
      // Si l'envoi SMS échoue, on invalide l'OTP en cache pour permettre
      // une nouvelle tentative immédiate (sinon l'utilisateur reste
      // bloqué pendant tout le TTL alors qu'il n'a jamais reçu de SMS).
      await this.otpService.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du SMS OTP à ${phone} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code par SMS. Réessayez dans un instant.",
      );
    }
  }
}
