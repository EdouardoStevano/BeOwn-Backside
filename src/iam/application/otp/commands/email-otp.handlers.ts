import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { type ConfigType } from '@nestjs/config';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { OTP_SERVICE, type OtpService } from 'src/iam/domain/ports/otp.service';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import { OtpTarget } from 'src/iam/domain/value-objects/otp-target.vo';
import {
  AccountNotFoundError,
  EmailDeliveryFailedError,
  OtpAlreadyActiveError,
} from 'src/iam/domain/errors/iam.errors';
import { humanizeDuration } from 'src/common/domain/duration';
import otpConfig from 'src/iam/infrastructure/config/otp.config';
import { SendEmailOtpCommand, VerifyEmailOtpCommand } from './otp.commands';

@CommandHandler(SendEmailOtpCommand)
export class SendEmailOtpHandler implements ICommandHandler<SendEmailOtpCommand> {
  private readonly logger = new Logger(SendEmailOtpHandler.name);

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(otpConfig.KEY)
    private readonly config: ConfigType<typeof otpConfig>,
  ) {}

  async execute(command: SendEmailOtpCommand): Promise<void> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) throw new AccountNotFoundError();

    const target = OtpTarget.email(command.email);

    if (await this.otpService.hasActiveChallenge(target)) {
      throw new OtpAlreadyActiveError();
    }

    const code = await this.otpService.generate(target);

    try {
      await this.emailService.sendOtpEmail(
        command.email,
        code,
        humanizeDuration(this.config.ttlSeconds),
      );
    } catch (err) {
      // Si l'envoi échoue, on invalide le code : sinon l'utilisateur reste
      // bloqué pendant tout le TTL alors qu'il n'a jamais reçu de mail.
      await this.otpService.invalidate(target);
      this.logger.error(
        `Échec de l'envoi du mail OTP à ${command.email} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new EmailDeliveryFailedError(
        "Impossible d'envoyer le code par email. Réessayez dans un instant.",
      );
    }
  }
}

@CommandHandler(VerifyEmailOtpCommand)
export class VerifyEmailOtpHandler implements ICommandHandler<VerifyEmailOtpCommand> {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
  ) {}

  async execute(command: VerifyEmailOtpCommand): Promise<boolean> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) throw new AccountNotFoundError();

    return this.otpService.verify(OtpTarget.email(command.email), command.otp);
  }
}
