import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
  type AuthTokens,
  type TokenPayload,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';
import { VerifyRegistrationOtpDto } from 'src/iam/presenters/http/dto/registration-otp.dto';
import {
  RegistrationOtpService,
  RegistrationOtpVerifyResult,
} from './registration-otp.service';

const INVALID_OR_EXPIRED_MESSAGE = 'Code invalide ou expiré';

/**
 * POST /auth/verify-otp — validates the registration OTP, flips the account
 * from CREE to EMAIL_VERIFIE (same lifecycle transition as the legacy
 * link-based /email/verify), and returns session tokens in the exact same
 * shape as sign-in so the user lands logged-in immediately instead of being
 * redirected back to the login form after verifying.
 */
@Injectable()
export class VerifyRegistrationOtpUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    private readonly registrationOtpService: RegistrationOtpService,
  ) {}

  async execute(dto: VerifyRegistrationOtpDto): Promise<AuthTokens> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      // Same generic message as a wrong/expired code — an unknown email
      // must not be distinguishable from a bad code at this endpoint.
      throw new UnauthorizedException(INVALID_OR_EXPIRED_MESSAGE);
    }

    const result = await this.registrationOtpService.verify(
      user.userEmail.email,
      dto.code,
    );

    if (result === RegistrationOtpVerifyResult.TOO_MANY_ATTEMPTS) {
      throw new UnauthorizedException(
        'Trop de tentatives — demandez un nouveau code.',
      );
    }
    if (result !== RegistrationOtpVerifyResult.OK) {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_MESSAGE);
    }

    user.userEmail.verify();
    // Mirrors VerifyEmailService.confirmEmail: only advances CREE ->
    // EMAIL_VERIFIE, never downgrades a status set further along by an
    // admin/onboarding step in the meantime.
    if (user.status === UserStatus.CREE) {
      user.status = UserStatus.EMAIL_VERIFIE;
    }
    await this.userRepository.update(user);

    return this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
      role: user.role,
    } as TokenPayload);
  }
}
