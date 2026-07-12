import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import {
  TOKEN_SERVICE,
  type TokenService,
  AuthTokens,
} from 'src/iam/domain/ports/token.service';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  OAUTH_HANDOFF_STORE,
  type OAuthHandoffStore,
} from 'src/iam/domain/ports/oauth-handoff.store';
import { AuthAccount } from 'src/iam/domain/models/auth-account';
import { SocialAuthCommand, SocialAuthResult } from './social-auth.command';

@CommandHandler(SocialAuthCommand)
export class SocialAuthHandler implements ICommandHandler<SocialAuthCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(OAUTH_HANDOFF_STORE)
    private readonly handoff: OAuthHandoffStore,
  ) {}

  async execute(command: SocialAuthCommand): Promise<SocialAuthResult> {
    const { social } = command;

    const existing = await this.accounts.findBySocialId(social.socialId);

    const { account, isNewUser } = existing
      ? { account: existing, isNewUser: false }
      : {
          // Une violation d'unicité sur l'email remonte du contexte Users comme
          // AccountAlreadyExistsError — plus aucun code d'erreur PostgreSQL à
          // intercepter ici.
          account: await this.accounts.registerSocial({
            firstname: social.firstname,
            lastname: social.lastname ?? null,
            email: social.email,
            socialId: social.socialId,
          }),
          isNewUser: true,
        };

    // Le fournisseur OAuth a déjà prouvé la possession de l'adresse.
    if (!account.emailVerified) {
      await this.accounts.markEmailAsVerified(account.email);
    }

    const tokens = await this.issueTokens(account);

    const code = randomUUID();
    await this.handoff.storeCode(code, tokens);

    return { code, isNewUser };
  }

  private issueTokens(account: AuthAccount): Promise<AuthTokens> {
    return this.tokenService.generateTokens({
      sub: account.accountId,
      email: account.email,
      role: account.role,
      refreshTokenId: null,
    });
  }
}
