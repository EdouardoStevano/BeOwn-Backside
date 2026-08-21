import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TokenService } from '../../services/token/token.service';
import { TokenEmailCacheService } from '../../services/token/token-email-cache.service';
import { AuthMailerService } from 'src/iam/application/services/auth-mailer.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';

@Injectable()
export class SendEmailVerificationUseCase {
  private readonly logger = new Logger(SendEmailVerificationUseCase.name);

  constructor(
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly emailTokenCache: TokenEmailCacheService,
    private readonly authMailer: AuthMailerService,
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

    await this.emailTokenCache.insertEmailTokenId(
      user.email,
      tokenId,
      'email_verify',
    );

    await this.authMailer.sendEmailVerificationLink(email, token);
  }
}
