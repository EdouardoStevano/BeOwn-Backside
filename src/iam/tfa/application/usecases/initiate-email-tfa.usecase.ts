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
} from 'src/iam/otp/applications/ports/otp.service';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { TfaAlreadyEnabledError } from 'src/users/domain/errors/tfa-already-enabled.error';

@Injectable()
export class InitiateEmailTfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  async execute(userId: number): Promise<{ message: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    const existing = await this.tfaRepository.findEmailMethodByUserId(userId);
    if (existing?.isActive) throw new TfaAlreadyEnabledError();

    const email = user.userEmail.email;
    const otp = await this.otpService.generateOtp(`2fa-enable:${email}`);
    await this.emailService.sendTwoFactorCodeEmail(email, otp);

    return { message: 'Code OTP envoyé à votre adresse email.' };
  }
}
