import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from 'src/profiles/applications/ports/repositories/profil.repository';
import { ResendRegistrationOtpDto } from 'src/iam/presenters/http/dto/registration-otp.dto';
import { RegistrationOtpService } from './registration-otp.service';
import { SendRegistrationOtpUseCase } from './send-registration-otp.usecase';

/**
 * POST /auth/resend-otp — always resolves (204), even for an unknown email,
 * an already-verified account, or a delivery failure. Same anti-enumeration
 * contract as VerifyEmailService.sendVerificationEmail: only the logs know
 * which branch actually ran.
 *
 * One deliberate exception: requesting canal 'sms' on an existing,
 * unverified account with no phone on file throws a 400. This *is* a narrow
 * enumeration channel (see comment below) but is accepted — the alternative
 * is silently no-op'ing an explicit channel choice the user is waiting on,
 * which defeats the point of offering the choice at all.
 */
@Injectable()
export class ResendRegistrationOtpUseCase {
  private readonly logger = new Logger(ResendRegistrationOtpUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    private readonly registrationOtpService: RegistrationOtpService,
    private readonly sendRegistrationOtpUseCase: SendRegistrationOtpUseCase,
  ) {}

  async execute(dto: ResendRegistrationOtpDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      this.logger.log(`resend-otp requested for unknown email: ${dto.email}`);
      return;
    }

    if (user.userEmail.isVerified) {
      this.logger.log(
        `resend-otp requested for already-verified email: ${dto.email}`,
      );
      return;
    }

    const throttled = await this.registrationOtpService.isResendThrottled(
      user.userEmail.email,
    );
    if (throttled) {
      this.logger.log(`resend-otp throttled (1/min) for: ${dto.email}`);
      return;
    }

    const canal = dto.canal ?? 'email';
    let phone: string | undefined;
    if (canal === 'sms') {
      const profil = await this.profilRepository.findProfilPPByUserId(
        user.userId,
      );
      if (!profil?.telephone) {
        // Reachable only for an existing, unverified account (unknown email
        // and already-verified cases already returned above) — see class
        // docblock for the accepted trade-off.
        throw new BadRequestException(
          "Aucun numéro de téléphone associé à ce compte. Choisissez le canal email.",
        );
      }
      phone = profil.telephone;
    }

    try {
      await this.sendRegistrationOtpUseCase.send(user, canal, phone);
    } catch (err) {
      this.logger.error(
        `Échec du renvoi du code d'inscription à ${dto.email} via ${canal}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Swallowed on purpose — resend-otp always responds 204.
    }
  }
}
