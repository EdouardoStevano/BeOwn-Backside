import { Command } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domains/ports/token.service';

export class RefreshTokenCommand extends Command<AuthTokens> {
  constructor(public readonly refreshToken: string) {
    super();
  }
}
