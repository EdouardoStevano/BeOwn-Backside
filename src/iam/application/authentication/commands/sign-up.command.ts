import { Command } from '@nestjs/cqrs';

export class SignUpCommand extends Command<unknown> {
  constructor(
    public readonly firstname: string,
    public readonly lastname: string | null,
    public readonly email: string,
    public readonly password: string,
    public readonly captchaToken?: string,
  ) {
    super();
  }
}
