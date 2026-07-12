import { Command } from '@nestjs/cqrs';
import { SecretOtpPayload } from '../ports/otp.service';

export class SetupTotpCommand extends Command<SecretOtpPayload> {
  constructor(public readonly email: string) {
    super();
  }
}
