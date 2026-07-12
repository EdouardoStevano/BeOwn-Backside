import { Command } from '@nestjs/cqrs';
import { TotpSecret } from 'src/iam/domain/ports/otp.service';

export class SendEmailOtpCommand extends Command<void> {
  constructor(public readonly email: string) {
    super();
  }
}

export class VerifyEmailOtpCommand extends Command<boolean> {
  constructor(
    public readonly email: string,
    public readonly otp: string,
  ) {
    super();
  }
}

export class SendSmsOtpCommand extends Command<void> {
  constructor(public readonly phone: string) {
    super();
  }
}

export class VerifySmsOtpCommand extends Command<boolean> {
  constructor(
    public readonly phone: string,
    public readonly otp: string,
  ) {
    super();
  }
}

export class SetupTotpCommand extends Command<TotpSecret> {
  constructor(public readonly email: string) {
    super();
  }
}

export class VerifyTotpCommand extends Command<boolean> {
  constructor(
    public readonly email: string,
    public readonly otp: string,
    public readonly secret: string,
  ) {
    super();
  }
}
