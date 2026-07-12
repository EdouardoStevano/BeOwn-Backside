import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
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
  SESSION_TOKEN_STORE,
  type SessionTokenStore,
} from 'src/iam/domain/ports/session-token.store';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import { InvalidOrExpiredTokenError } from 'src/iam/domain/errors/iam.errors';
import { ResetPasswordCommand } from './reset-password.command';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<ResetPasswordCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(ONE_TIME_TOKEN_STORE)
    private readonly oneTimeTokens: OneTimeTokenStore,
    @Inject(SESSION_TOKEN_STORE)
    private readonly sessions: SessionTokenStore,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    let payload: PasswordResetTokenPayload;
    try {
      // Rejette aussi un token expiré (TTL JWT) ou d'un autre type.
      payload = await this.tokenService.verifyPasswordResetToken(command.token);
    } catch {
      throw new InvalidOrExpiredTokenError();
    }

    const isPending = await this.oneTimeTokens.isPending(
      OneTimeTokenPurpose.PASSWORD_RESET,
      payload.email,
      payload.resetTokenId,
    );
    if (!isPending) {
      // Lien déjà consommé, révoqué par une demande plus récente, ou expiré.
      throw new InvalidOrExpiredTokenError();
    }

    // Consommé avant la mise à jour : deux requêtes concurrentes avec le même
    // lien ne peuvent pas passer toutes les deux.
    await this.oneTimeTokens.consume(
      OneTimeTokenPurpose.PASSWORD_RESET,
      payload.email,
    );

    await this.accounts.changePassword(payload.email, command.newPassword);

    // Le mot de passe a changé : les sessions ouvertes ailleurs ne doivent pas
    // survivre.
    await this.sessions.invalidate(payload.email);
  }
}
