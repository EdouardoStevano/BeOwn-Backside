import { BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { VerifyTotpCommand } from './verify-totp.command';

@CommandHandler(VerifyTotpCommand)
export class VerifyTotpHandler implements ICommandHandler<VerifyTotpCommand> {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(command: VerifyTotpCommand): Promise<boolean> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const valid = this.otpService.verifyTotp(command.otp, command.secret);
    if (!valid) throw new BadRequestException('Code TOTP invalide');
    return true;
  }
}
