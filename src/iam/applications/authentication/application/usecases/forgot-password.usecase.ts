import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Inject } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
} from 'src/iam/domains/ports/token.service';
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
  ) {}

  async execute(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      // Silently no-op to avoid user enumeration via this endpoint.
      // Client gets 204 whether or not the email exists.
      this.logger.log(`Forgot-password requested for unknown email: ${dto.email}`);
      return;
    }

    const payload: EmailTokenPayload = {
      sub: user.userId,
      email: user.userEmail.email,
      emailTokenId: randomBytes(32).toString('hex'),
    };

    const token = await this.tokenService.generateEmailToken(payload);

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
