import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'crypto';
import { type ConfigType } from '@nestjs/config';
import {
  TOKEN_SERVICE,
  type TokenService,
  PasswordResetTokenPayload,
} from 'src/iam/domain/ports/token.service';
import {
  ONE_TIME_TOKEN_STORE,
  OneTimeTokenPurpose,
  type OneTimeTokenStore,
} from 'src/iam/domain/ports/one-time-token.store';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { EmailDeliveryFailedError } from 'src/iam/domain/errors/iam.errors';
import { humanizeDuration } from 'src/common/domain/duration';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { ForgotPasswordCommand } from './forgot-password.command';

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler implements ICommandHandler<ForgotPasswordCommand> {
  private readonly logger = new Logger(ForgotPasswordHandler.name);

  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(ONE_TIME_TOKEN_STORE)
    private readonly oneTimeTokens: OneTimeTokenStore,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    const account = await this.accounts.findByEmail(command.email);

    if (!account) {
      // On ne dit pas au client que l'adresse est inconnue : la réponse est un
      // 204 dans les deux cas, sinon l'endpoint devient un oracle d'énumération.
      this.logger.log(
        `Forgot-password requested for unknown email: ${command.email}`,
      );
      return;
    }

    const payload: PasswordResetTokenPayload = {
      sub: account.accountId,
      email: account.email,
      resetTokenId: randomBytes(32).toString('hex'),
    };

    const token = await this.tokenService.generatePasswordResetToken(payload);

    // Mémoriser l'identifiant du token est ce qui rend le lien à usage unique :
    // le reset le consomme. Émettre un nouveau lien écrase le précédent, qui
    // devient mort.
    await this.oneTimeTokens.issue(
      OneTimeTokenPurpose.PASSWORD_RESET,
      payload.email,
      payload.resetTokenId,
    );

    try {
      await this.emailService.sendPasswordResetEmail(
        command.email,
        token,
        humanizeDuration(this.jwtConfiguration.passwordResetTtl),
      );
    } catch (err) {
      this.logger.error('Failed to send password reset email', err);
      throw new EmailDeliveryFailedError(
        "Impossible d'envoyer l'email de réinitialisation. Veuillez réessayer.",
      );
    }
  }
}
