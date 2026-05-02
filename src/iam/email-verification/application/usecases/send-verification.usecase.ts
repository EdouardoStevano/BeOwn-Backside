import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domain/ports/cahe-manager.service';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { UserNotFoundError } from 'src/users/domain/errors/user-not-found.error';
import { randomUUID } from 'crypto';

@Injectable()
export class SendVerificationUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (user.isEmailVerified()) {
      return;
    }

    const tokenId = randomUUID();
    const token = await this.tokenService.generateEmailToken({
      sub: user.userId,
      email: user.userEmail.email,
      emailTokenId: tokenId,
    });

    await this.cacheManagerService.insertEmailTokenId(user.userEmail.email, tokenId);

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await this.emailService.sendVerificationEmail(
      user.userEmail.email,
      `${appUrl}/email/verify?token=${token}`,
    );
  }
}
