import { Command } from '@nestjs/cqrs';

export class VerifyEmailOtpCommand extends Command<boolean> {
  constructor(
    public readonly email: string,
    public readonly otp: string,
  ) {
    super();
  }
}
