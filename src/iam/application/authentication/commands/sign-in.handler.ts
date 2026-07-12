import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  type TokenService,
  AuthTokens,
} from 'src/iam/domain/ports/token.service';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import { InvalidCredentialsError } from 'src/iam/domain/errors/iam.errors';
import { SignInCommand } from './sign-in.command';

@CommandHandler(SignInCommand)
export class SignInHandler implements ICommandHandler<SignInCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  async execute(command: SignInCommand): Promise<AuthTokens> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) {
      throw new InvalidCredentialsError();
    }

    // L'invariant vit dans l'agrégat, pas dans ce handler.
    account.ensureCanSignIn();

    // Le mot de passe est vérifié par le contexte qui le détient : IAM ne voit
    // jamais le hash.
    const isValid = await this.accounts.verifyPassword(
      command.email,
      command.password,
    );
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    return this.tokenService.generateTokens({
      sub: account.accountId,
      email: account.email,
      role: account.role,
    });
  }
}
