import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Inject } from '@nestjs/common';
import { EmailTokenPayload } from 'src/iam/applications/models/auth-token';
import { TokenService } from '../services/token/token.service';
import { TokenEmailCacheService } from '../services/token/token-email-cache.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/shared/email/email.service';
import { PasswordResetEmailFailedError } from 'src/iam/domains/errors';

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly emailTokenCache: TokenEmailCacheService,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Silently no-op to avoid user enumeration via this endpoint.
      // Client gets 204 whether or not the email exists.
      this.logger.log(`Forgot-password requested for unknown email: ${email}`);
      return;
    }

    const emailTokenId = randomBytes(32).toString('hex');
    const payload: Omit<EmailTokenPayload, 'type'> = {
      sub: user.userId,
      email: user.email,
      emailTokenId,
    };

    const token = await this.tokenService.generateEmailToken(
      payload,
      'password_reset',
    );

    // Single-use, same Redis pattern as email verification: store the
    // tokenId now, ResetPasswordUseCase checks-and-invalidates it so a
    // reset link can't be replayed after first use.
    await this.emailTokenCache.insertEmailTokenId(
      user.email,
      emailTokenId,
      'password_reset',
    );

    if (this.emailService.sendPasswordResetEmail) {
      try {
        await this.emailService.sendPasswordResetEmail(email, token);
      } catch (err) {
        this.logger.error('Failed to send password reset email', err);
        throw new PasswordResetEmailFailedError(err);
      }
    }
  }
}
