import { Inject, Injectable, Logger } from '@nestjs/common';
import { OTP_STORE, type OtpStore } from 'src/iam/applications/ports/otp-store.port';
import {
  AUTH_MAILER,
  type AuthMailer,
} from 'src/iam/applications/ports/auth-mailer.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  OtpAlreadyActiveError,
  OtpDeliveryFailedError,
  UserNotFoundError,
} from 'src/iam/domains/errors';

const emailOtpKey = (email: string): string => `otp:email:${email}`;

@Injectable()
export class CreateEmailOtpUseCase {
  private readonly logger = new Logger(CreateEmailOtpUseCase.name);

  constructor(
    @Inject(OTP_STORE) private readonly otpStore: OtpStore,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTH_MAILER) private readonly authMailer: AuthMailer,
  ) {}

  async send(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new UserNotFoundError();

    const key = emailOtpKey(email);
    const hasActive = await this.otpStore.hasActiveOtp(key);
    if (hasActive) {
      throw new OtpAlreadyActiveError();
    }

    const otp = await this.otpStore.generateOtp(key);

    try {
      await this.authMailer.sendLoginOtp(email, otp);
    } catch (err) {
      // Si l'envoi échoue, on invalide l'OTP en cache pour permettre
      // une nouvelle tentative immédiate (sinon l'utilisateur reste
      // bloqué pendant tout le TTL alors qu'il n'a jamais reçu de mail).
      await this.otpStore.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du mail OTP à ${email} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new OtpDeliveryFailedError(
        "Impossible d'envoyer le code par email. Réessayez dans un instant.",
        err,
      );
    }
  }

  async verify(email: string, otp: string): Promise<boolean> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new UserNotFoundError();

    return this.otpStore.verifyOtp(emailOtpKey(email), otp);
  }
}
