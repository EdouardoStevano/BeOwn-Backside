import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { VerifyEmailOtpCommand } from './verify-email-otp.command';
import { emailOtpKey } from './otp-keys';

@CommandHandler(VerifyEmailOtpCommand)
export class VerifyEmailOtpHandler
  implements ICommandHandler<VerifyEmailOtpCommand>
{
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(command: VerifyEmailOtpCommand): Promise<boolean> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    return this.otpService.verifyOtp(emailOtpKey(command.email), command.otp);
  }
}
