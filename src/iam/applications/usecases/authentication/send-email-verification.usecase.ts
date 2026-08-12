import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domains/ports/token.port';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cache-manager.port';
import {
  AUTH_MAILER,
  type AuthMailer,
} from 'src/iam/domains/ports/auth-mailer.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';

@Injectable()
export class SendEmailVerificationUseCase {
  private readonly logger = new Logger(SendEmailVerificationUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
    @Inject(AUTH_MAILER) private readonly authMailer: AuthMailer,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email);

    // Anti-énumération : cet endpoint est @Public et non authentifié, sa
    // réponse ne doit jamais permettre de distinguer « email inconnu » de
    // « déjà vérifié » de « envoyé » — les trois se résolvent pareil. Le
    // détail part dans les logs, pas dans la réponse HTTP.
    if (!user) {
      this.logger.log(
        `send-verification requested for unknown email: ${email}`,
      );
      return;
    }

    if (user.isEmailVerified()) {
      this.logger.log(
        `send-verification requested for already-verified email: ${email}`,
      );
      return;
    }

    const tokenId = randomUUID();

    const token = await this.tokenService.generateEmailToken(
      {
        sub: user.userId,
        email: user.email,
        emailTokenId: tokenId,
      },
      'email_verify',
    );

    await this.cacheManagerService.insertEmailTokenId(
      user.email,
      tokenId,
      'email_verify',
    );

    await this.authMailer.sendEmailVerificationLink(email, token);
  }
}
