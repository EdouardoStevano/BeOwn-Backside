import { Command } from '@nestjs/cqrs';

export class VerifySmsOtpCommand extends Command<boolean> {
  constructor(
    public readonly phone: string,
    public readonly otp: string,
  ) {
    super();
  }
}
