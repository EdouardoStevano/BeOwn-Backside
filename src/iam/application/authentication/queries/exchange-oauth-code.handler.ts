import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  OAUTH_HANDOFF_STORE,
  type OAuthHandoffStore,
} from 'src/iam/domain/ports/oauth-handoff.store';
import { AuthTokens } from 'src/iam/domain/ports/token.service';
import { InvalidOAuthCodeError } from 'src/iam/domain/errors/iam.errors';
import { ExchangeOAuthCodeQuery } from './exchange-oauth-code.query';

@QueryHandler(ExchangeOAuthCodeQuery)
export class ExchangeOAuthCodeHandler implements IQueryHandler<ExchangeOAuthCodeQuery> {
  constructor(
    @Inject(OAUTH_HANDOFF_STORE) private readonly handoff: OAuthHandoffStore,
  ) {}

  async execute(query: ExchangeOAuthCodeQuery): Promise<AuthTokens> {
    const tokens = await this.handoff.consumeCode(query.code);
    if (!tokens) {
      throw new InvalidOAuthCodeError();
    }
    return tokens;
  }
}
