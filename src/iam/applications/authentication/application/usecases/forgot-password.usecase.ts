import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Inject } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
} from 'src/iam/domains/ports/token.service';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cahe-manager.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { ForgotPasswordDto } from '../../../../presenters/http/dto/password.dto';
import { EMAIL_SERVICE, type EmailService } from 'src/common/email/email.service';

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
  ) {}

  async execute(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      // Silently no-op to avoid user enumeration via this endpoint.
      // Client gets 204 whether or not the email exists.
      this.logger.log(`Forgot-password requested for unknown email: ${dto.email}`);
      return;
    }

    const emailTokenId = randomBytes(32).toString('hex');
    const payload: Omit<EmailTokenPayload, 'type'> = {
      sub: user.userId,
      email: user.userEmail.email,
      emailTokenId,
    };

    const token = await this.tokenService.generateEmailToken(
      payload,
      'password_reset',
    );

    // Single-use, same Redis pattern as email verification: store the
    // tokenId now, ResetPasswordUseCase checks-and-invalidates it so a
    // reset link can't be replayed after first use.
    await this.cacheManagerService.insertEmailTokenId(
      user.userEmail.email,
      emailTokenId,
      'password_reset',
    );

    if (this.emailService.sendPasswordResetEmail) {
      try {
        await this.emailService.sendPasswordResetEmail(dto.email, token);
      } catch (err) {
        this.logger.error('Failed to send password reset email', err);
        throw new InternalServerErrorException(
          "Impossible d'envoyer l'email de réinitialisation. Veuillez réessayer.",
        );
      }
    }
  }
}
