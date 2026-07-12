import { Command } from '@nestjs/cqrs';

export class ResetPasswordCommand extends Command<void> {
  constructor(
    public readonly token: string,
    public readonly newPassword: string,
  ) {
    super();
  }
}
