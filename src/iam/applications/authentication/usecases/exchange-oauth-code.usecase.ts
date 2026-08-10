import { Inject, Injectable } from '@nestjs/common';
import { InvalidOAuthCodeError } from 'src/iam/domains/errors';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cache-manager.port';
import { AuthSession } from 'src/iam/domains/ports/token.port';

/** Échange le code OAuth à usage unique (30 s) contre les tokens de session. */
@Injectable()
export class ExchangeOAuthCodeUseCase {
  constructor(
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
  ) {}

  async execute(code: string): Promise<AuthSession> {
    const session = await this.cacheManagerService.getAndDeleteOAuthCode(code);
    if (!session) throw new InvalidOAuthCodeError();
    return session;
  }
}
