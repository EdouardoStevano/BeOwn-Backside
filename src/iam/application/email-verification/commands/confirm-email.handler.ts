import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
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
import { InvalidEmailVerificationTokenError } from 'src/iam/domain/errors/iam.errors';
import { ConfirmEmailCommand } from './confirm-email.command';

@CommandHandler(ConfirmEmailCommand)
export class ConfirmEmailHandler implements ICommandHandler<ConfirmEmailCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(ONE_TIME_TOKEN_STORE)
    private readonly oneTimeTokens: OneTimeTokenStore,
  ) {}

  async execute(command: ConfirmEmailCommand): Promise<string> {
    let payload: EmailTokenPayload;
    try {
      payload = await this.tokenService.verifyEmailToken(command.token);
    } catch {
      throw new InvalidEmailVerificationTokenError();
    }

    const isPending = await this.oneTimeTokens.isPending(
      OneTimeTokenPurpose.EMAIL_VERIFICATION,
      payload.email,
      payload.emailTokenId,
    );
    if (!isPending) {
      throw new InvalidEmailVerificationTokenError();
    }

    await this.oneTimeTokens.consume(
      OneTimeTokenPurpose.EMAIL_VERIFICATION,
      payload.email,
    );

    await this.accounts.markEmailAsVerified(payload.email);

    return payload.email;
  }
}
