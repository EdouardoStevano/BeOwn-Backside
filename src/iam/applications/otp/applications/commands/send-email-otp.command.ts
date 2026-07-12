import { Command } from '@nestjs/cqrs';

export class SendEmailOtpCommand extends Command<void> {
  constructor(public readonly email: string) {
    super();
  }
}
