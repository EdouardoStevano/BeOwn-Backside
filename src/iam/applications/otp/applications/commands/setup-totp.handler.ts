import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  OTP_SERVICE,
  type OtpService,
  type SecretOtpPayload,
} from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { SetupTotpCommand } from './setup-totp.command';

@CommandHandler(SetupTotpCommand)
export class SetupTotpHandler implements ICommandHandler<SetupTotpCommand> {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(command: SetupTotpCommand): Promise<SecretOtpPayload> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    return this.otpService.generateSecretTotp(command.email);
  }
}
