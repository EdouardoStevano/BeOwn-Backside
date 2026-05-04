import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import {
  TFA_REPOSITORY,
  type TfaRepository,
} from 'src/users/domain/ports/tfa.repository';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domain/ports/cahe-manager.service';
import {
  OTP_SERVICE,
  type OtpService,
} from 'src/iam/domain/ports/otp.service';
import { TotpMethod } from 'src/users/domains/tfa-method';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { TfaInvalidOtpError } from 'src/users/domain/errors/tfa-invalid-otp.error';

@Injectable()
export class ConfirmTotpUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManager: CacheManagerService,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
  ) {}

  async execute(userId: number, totp: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    const secret = await this.cacheManager.get<string>(`totp-setup:${userId}`);
    if (!secret) throw new TfaInvalidOtpError();

    const isValid = this.otpService.verifyTotp(totp, secret);
    if (!isValid) throw new TfaInvalidOtpError();

    await this.cacheManager.remove(`totp-setup:${userId}`);

    const existing = await this.tfaRepository.findTotpMethodByUserId(userId);
    const method = existing ?? new TotpMethod();
    method.isActive = true;
    method.secretKeyOtp = secret;

    await this.tfaRepository.saveTotpMethod(method, userId);
    return { success: true };
  }
}
