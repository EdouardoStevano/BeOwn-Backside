import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domain/ports/cahe-manager.service';
import {
  TOKEN_SERVICE,
  TokenPayload,
  AuthTokens,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import {
  TFA_REPOSITORY,
  type TfaRepository,
} from 'src/users/domain/ports/tfa.repository';
import {
  OTP_SERVICE,
  type OtpService,
} from 'src/iam/domain/ports/otp.service';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { TfaInvalidOtpError } from 'src/users/domain/errors/tfa-invalid-otp.error';

@Injectable()
export class VerifyTotpUseCase {
  constructor(
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManager: CacheManagerService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
  ) {}

  async execute(twoFactorToken: string, totp: string): Promise<AuthTokens> {
    const userId = await this.cacheManager.getTwoFactorSession(twoFactorToken);
    if (!userId) throw new InvalidCredentialsError();

    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    const method = await this.tfaRepository.findTotpMethodByUserId(userId);
    if (!method?.isActive) throw new InvalidCredentialsError();

    const isValid = this.otpService.verifyTotp(totp, method.secretKeyOtp);
    if (!isValid) throw new TfaInvalidOtpError();

    await this.cacheManager.removeTwoFactorSession(twoFactorToken);

    return this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
    } as TokenPayload);
  }
}
