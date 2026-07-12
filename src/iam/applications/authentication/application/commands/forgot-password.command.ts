import { Command } from '@nestjs/cqrs';

export class ForgotPasswordCommand extends Command<void> {
  constructor(public readonly email: string) {
    super();
  }
}
