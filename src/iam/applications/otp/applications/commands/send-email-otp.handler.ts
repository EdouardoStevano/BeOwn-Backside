import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { SendEmailOtpCommand } from './send-email-otp.command';
import { emailOtpKey, otpExpiryLabel } from './otp-keys';

@CommandHandler(SendEmailOtpCommand)
export class SendEmailOtpHandler implements ICommandHandler<SendEmailOtpCommand> {
  private readonly logger = new Logger(SendEmailOtpHandler.name);

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  async execute(command: SendEmailOtpCommand): Promise<void> {
    const { email } = command;

    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const key = emailOtpKey(email);
    const hasActive = await this.otpService.hasActiveOtp(key);
    if (hasActive) {
      throw new BadRequestException(
        'Un OTP est déjà actif, veuillez patienter',
      );
    }

    const otp = await this.otpService.generateOtp(key);

    try {
      await this.emailService.sendOtpEmail(email, otp, otpExpiryLabel());
    } catch (err) {
      // Si l'envoi échoue, on invalide l'OTP en cache pour permettre
      // une nouvelle tentative immédiate (sinon l'utilisateur reste
      // bloqué pendant tout le TTL alors qu'il n'a jamais reçu de mail).
      await this.otpService.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du mail OTP à ${email} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code par email. Réessayez dans un instant.",
      );
    }
  }
}
