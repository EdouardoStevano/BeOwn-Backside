import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  TOKEN_SERVICE,
  TokenPayload,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domain/ports/cahe-manager.service';
import {
  OTP_SERVICE,
  type OtpService,
} from 'src/iam/domain/ports/otp.service';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { SignInDto } from '../../presenters/http/dto/sign-in.dto';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { EmailNotVerifiedError } from 'src/users/domain/errors/email-not-verified.error';
import { AuthTokens } from 'src/iam/domain/ports/token.service';

export type SignInResult =
  | AuthTokens
  | { requiresTwoFactor: true; twoFactorToken: string; method: 'email' | 'totp' };

@Injectable()
export class SignInUsecase {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManager: CacheManagerService,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  async signIn(signInDto: SignInDto): Promise<SignInResult> {
    const user = await this.usersRepository.findByEmail(signInDto.email);

    if (!user) throw new InvalidCredentialsError();
    if (!user.isEmailVerified()) throw new EmailNotVerifiedError();

    const isValidPassword = await this.hashingService.compare(
      signInDto.password,
      user.password!,
    );
    if (!isValidPassword) throw new InvalidCredentialsError();

    if (user.hasTwoFactorEmailEnabled()) {
      const email = user.userEmail.email;
      const otp = await this.otpService.generateOtp(`2fa-otp:${email}`);
      await this.emailService.sendTwoFactorCodeEmail(email, otp);

      const twoFactorToken = randomUUID();
      await this.cacheManager.insertTwoFactorSession(twoFactorToken, user.userId);

      return { requiresTwoFactor: true, twoFactorToken, method: 'email' as const };
    }

    if (user.hasTwoFactorTotpEnabled()) {
      const twoFactorToken = randomUUID();
      await this.cacheManager.insertTwoFactorSession(twoFactorToken, user.userId);

      return { requiresTwoFactor: true, twoFactorToken, method: 'totp' as const };
    }

    return this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
    } as TokenPayload);
  }
}
