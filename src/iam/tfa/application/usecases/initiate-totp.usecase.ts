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
  OTP_SERVICE,
  type OtpService,
} from 'src/iam/domain/ports/otp.service';
import { TotpMethod } from 'src/users/domains/tfa-method';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { TfaMethodConflictError } from 'src/users/domain/errors/tfa-method-conflict.error';

export interface TotpSetupPayload {
  secret: string;
  uri: string;
}

@Injectable()
export class InitiateTotpUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
  ) {}

  async execute(userId: number): Promise<TotpSetupPayload> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    if (user.hasAnyTwoFactorEnabled()) throw new TfaMethodConflictError();

    const { secret, uri } = this.otpService.generateSecretTotp(user.userEmail.email);

    const existing = await this.tfaRepository.findTotpMethodByUserId(userId);
    const method = existing ?? new TotpMethod();
    method.isActive = true;
    method.secretKeyOtp = secret;

    await this.tfaRepository.saveTotpMethod(method, userId);

    return { secret, uri };
  }
}
