import { Injectable } from '@nestjs/common';
import { InvalidOAuthCodeError } from 'src/iam/domain/errors';
import { SessionCacheService } from '../../services/session-cache.service';
import { AuthSession } from 'src/iam/application/dto/auth-token';

/** Échange le code OAuth à usage unique (30 s) contre les tokens de session. */
@Injectable()
export class ExchangeOAuthCodeUseCase {
  constructor(private readonly sessionCache: SessionCacheService) {}

  async execute(code: string): Promise<AuthSession> {
    const session = await this.sessionCache.getAndDeleteOAuthCode(code);
    if (!session) throw new InvalidOAuthCodeError();
    return session;
  }
}
