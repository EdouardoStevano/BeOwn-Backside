import { Command } from '@nestjs/cqrs';

export class VerifyTotpCommand extends Command<boolean> {
  constructor(
    public readonly email: string,
    public readonly otp: string,
    public readonly secret: string,
  ) {
    super();
  }
}
