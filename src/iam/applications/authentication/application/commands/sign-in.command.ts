import { Command } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domains/ports/token.service';

export class SignInCommand extends Command<AuthTokens> {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
