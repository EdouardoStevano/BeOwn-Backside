import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SMS_SERVICE, type SmsService } from 'src/common/sms/sms.service';
import { OTP_SERVICE, type OtpService } from 'src/iam/domain/ports/otp.service';
import { OtpTarget } from 'src/iam/domain/value-objects/otp-target.vo';
import {
  OtpAlreadyActiveError,
  SmsDeliveryFailedError,
} from 'src/iam/domain/errors/iam.errors';
import { SendSmsOtpCommand, VerifySmsOtpCommand } from './otp.commands';

@CommandHandler(SendSmsOtpCommand)
export class SendSmsOtpHandler implements ICommandHandler<SendSmsOtpCommand> {
  private readonly logger = new Logger(SendSmsOtpHandler.name);

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {}

  async execute(command: SendSmsOtpCommand): Promise<void> {
    // Le format E.164 est validé par le value object, à la construction.
    const target = OtpTarget.phone(command.phone);

    if (await this.otpService.hasActiveChallenge(target)) {
      throw new OtpAlreadyActiveError(
        'Un code est déjà actif sur ce numéro, veuillez patienter.',
      );
    }

    const code = await this.otpService.generate(target);

    try {
      await this.smsService.sendOtp(target.value, code);
    } catch (err) {
      // Même raison que pour l'OTP email : sans invalidation, l'utilisateur
      // resterait bloqué tout le TTL sans avoir reçu de SMS.
      await this.otpService.invalidate(target);
      this.logger.error(
        `Échec de l'envoi du SMS OTP à ${target.value} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new SmsDeliveryFailedError();
    }
  }
}

@CommandHandler(VerifySmsOtpCommand)
export class VerifySmsOtpHandler implements ICommandHandler<VerifySmsOtpCommand> {
  constructor(@Inject(OTP_SERVICE) private readonly otpService: OtpService) {}

  execute(command: VerifySmsOtpCommand): Promise<boolean> {
    return this.otpService.verify(OtpTarget.phone(command.phone), command.otp);
  }
}
