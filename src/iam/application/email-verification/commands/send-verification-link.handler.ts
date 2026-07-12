import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { type ConfigType } from '@nestjs/config';
import {
  TOKEN_SERVICE,
  type TokenService,
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
import {
  AccountNotFoundError,
  EmailAlreadyVerifiedError,
} from 'src/iam/domain/errors/iam.errors';
import appUrlsConfig from 'src/iam/infrastructure/config/app-urls.config';
import { SendVerificationLinkCommand } from './send-verification-link.command';

@CommandHandler(SendVerificationLinkCommand)
export class SendVerificationLinkHandler implements ICommandHandler<SendVerificationLinkCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(ONE_TIME_TOKEN_STORE)
    private readonly oneTimeTokens: OneTimeTokenStore,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(appUrlsConfig.KEY)
    private readonly urls: ConfigType<typeof appUrlsConfig>,
  ) {}

  async execute(command: SendVerificationLinkCommand): Promise<void> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) throw new AccountNotFoundError();

    if (account.emailVerified) throw new EmailAlreadyVerifiedError();

    const tokenId = randomUUID();

    const token = await this.tokenService.generateEmailToken({
      sub: account.accountId,
      email: account.email,
      emailTokenId: tokenId,
    });

    await this.oneTimeTokens.issue(
      OneTimeTokenPurpose.EMAIL_VERIFICATION,
      account.email,
      tokenId,
    );

    // L'URL vient d'une configuration typée : plus de process.env dans un handler.
    const confirmEmailUrl = `${this.urls.api}/email/verify?token=${token}`;

    await this.emailService.sendEmailVerificationLink(
      account.email,
      confirmEmailUrl,
    );
  }
}
