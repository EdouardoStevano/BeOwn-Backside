import { Command } from '@nestjs/cqrs';

export class SendSmsOtpCommand extends Command<void> {
  constructor(public readonly phone: string) {
    super();
  }
}
