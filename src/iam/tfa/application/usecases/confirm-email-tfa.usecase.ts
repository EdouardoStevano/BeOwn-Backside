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
import { EmailMethod } from 'src/users/domains/tfa-method';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { TfaInvalidOtpError } from 'src/users/domain/errors/tfa-invalid-otp.error';

@Injectable()
export class ConfirmEmailTfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
  ) {}

  async execute(userId: number, otp: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    const email = user.userEmail.email;
    const isValid = await this.otpService.verifyOtp(`2fa-enable:${email}`, otp);
    if (!isValid) throw new TfaInvalidOtpError();

    const existing = await this.tfaRepository.findEmailMethodByUserId(userId);
    const method = existing ?? new EmailMethod();
    method.isActive = true;
    method.emailOtp = email;

    await this.tfaRepository.saveEmailMethod(method, userId);
    return { success: true };
  }
}
