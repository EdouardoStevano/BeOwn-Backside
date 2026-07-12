import { Command } from '@nestjs/cqrs';

export class SendVerificationLinkCommand extends Command<void> {
  constructor(public readonly email: string) {
    super();
  }
}
