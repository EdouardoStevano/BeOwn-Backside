import { Inject, InternalServerErrorException, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'crypto';
import { type ConfigType } from '@nestjs/config';
import {
  TOKEN_SERVICE,
  type TokenService,
  PasswordResetTokenPayload,
} from 'src/iam/domains/ports/token.service';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cahe-manager.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { ForgotPasswordCommand } from './forgot-password.command';

/** Libellé dérivé du TTL réel, pour que le mail ne promette jamais une durée
 *  que le token ne tient pas. */
const expiryLabel = (ttlSeconds: number): string => {
  if (ttlSeconds % 3600 === 0) {
    const hours = ttlSeconds / 3600;
    return hours === 1 ? '1 heure' : `${hours} heures`;
  }
  if (ttlSeconds % 60 === 0) {
    const minutes = ttlSeconds / 60;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return `${ttlSeconds} secondes`;
};

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler implements ICommandHandler<ForgotPasswordCommand> {
  private readonly logger = new Logger(ForgotPasswordHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) {
      // Silently no-op to avoid user enumeration via this endpoint.
      // Client gets 204 whether or not the email exists.
      this.logger.log(
        `Forgot-password requested for unknown email: ${command.email}`,
      );
      return;
    }

    const payload: PasswordResetTokenPayload = {
      sub: user.userId,
      email: user.userEmail.email,
      resetTokenId: randomBytes(32).toString('hex'),
    };

    const token = await this.tokenService.generatePasswordResetToken(payload);

    // Le tokenId en cache est ce qui rend le lien à usage unique : le reset le
    // consomme. Émettre un nouveau lien écrase le précédent, qui devient mort.
    await this.cacheManagerService.insertPasswordResetTokenId(
      payload.email,
      payload.resetTokenId,
    );

    try {
      await this.emailService.sendPasswordResetEmail(
        command.email,
        token,
        expiryLabel(this.jwtConfiguration.passwordResetTtl),
      );
    } catch (err) {
      this.logger.error('Failed to send password reset email', err);
      throw new InternalServerErrorException(
        "Impossible d'envoyer l'email de réinitialisation. Veuillez réessayer.",
      );
    }
  }
}
