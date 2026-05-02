import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domain/ports/cahe-manager.service';
import {
  TOKEN_SERVICE,
  TokenPayload,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import {
  OTP_SERVICE,
  type OtpService,
} from 'src/iam/otp/applications/ports/otp.service';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { TfaInvalidOtpError } from 'src/users/domain/errors/tfa-invalid-otp.error';
import { AuthTokens } from 'src/iam/domain/ports/token.service';

@Injectable()
export class VerifyEmailOtpUseCase {
  constructor(
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManager: CacheManagerService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
  ) {}

  async execute(twoFactorToken: string, otp: string): Promise<AuthTokens> {
    const userId = await this.cacheManager.getTwoFactorSession(twoFactorToken);
    if (!userId) throw new InvalidCredentialsError();

    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    const email = user.userEmail.email;
    const isValid = await this.otpService.verifyOtp(`2fa-otp:${email}`, otp);
    if (!isValid) throw new TfaInvalidOtpError();

    await this.cacheManager.removeTwoFactorSession(twoFactorToken);

    return this.tokenService.generateTokens({
      sub: user.userId,
      email,
    } as TokenPayload);
  }
}
