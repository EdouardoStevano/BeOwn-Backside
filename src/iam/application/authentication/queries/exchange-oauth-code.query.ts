import { Query } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domain/ports/token.service';

/** Échange du code de redirection OAuth contre les tokens (usage unique, 30 s). */
export class ExchangeOAuthCodeQuery extends Query<AuthTokens> {
  constructor(public readonly code: string) {
    super();
  }
}
