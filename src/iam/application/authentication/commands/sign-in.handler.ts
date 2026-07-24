import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'crypto';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  TWO_FACTOR_GATEWAY,
  type TwoFactorGateway,
  TwoFactorEnrollment,
} from 'src/iam/domain/ports/two-factor.gateway';
import {
  ONE_TIME_TOKEN_STORE,
  OneTimeTokenPurpose,
  type OneTimeTokenStore,
} from 'src/iam/domain/ports/one-time-token.store';
import { InvalidCredentialsError } from 'src/iam/domain/errors/iam.errors';
import { TwoFactorChallengeService } from 'src/iam/application/two-factor/two-factor-challenge.service';
import { SignInCommand, SignInResult } from './sign-in.command';

@CommandHandler(SignInCommand)
export class SignInHandler implements ICommandHandler<SignInCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(TWO_FACTOR_GATEWAY) private readonly twoFactor: TwoFactorGateway,
    @Inject(ONE_TIME_TOKEN_STORE)
    private readonly oneTimeTokens: OneTimeTokenStore,
    private readonly challenges: TwoFactorChallengeService,
  ) {}

  async execute(command: SignInCommand): Promise<SignInResult> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) {
      throw new InvalidCredentialsError();
    }

    // Le mot de passe est vérifié par le contexte qui le détient : IAM ne voit
    // jamais le hash.
    const isValid = await this.accounts.verifyPassword(
      command.email,
      command.password,
    );
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    // Après la vérification du mot de passe, et pas avant : « email non
    // vérifié » et « compte suspendu » sont bien plus bavards que « identifiants
    // invalides ». Les lever d'abord permettrait à qui connaît une adresse de
    // sonder l'état du compte sans jamais fournir de mot de passe valide.
    // L'invariant lui-même vit dans l'agrégat, pas dans ce handler.
    account.ensureCanSignIn();

    const enrollment = await this.twoFactor.findActive(account.email);
    if (!enrollment) {
      return this.tokenService.generateTokens({
        sub: account.accountId,
        email: account.email,
        role: account.role,
      });
    }

    return this.issueChallenge(account.accountId, account.email, enrollment);
  }

  /**
   * Mot de passe validé, second facteur à venir. Le client repart avec un jeton
   * qui ne prouve que ça — il ne donne accès à aucune ressource, et ne vaut que
   * pour l'étape de vérification.
   */
  private async issueChallenge(
    accountId: number,
    email: string,
    enrollment: TwoFactorEnrollment,
  ): Promise<SignInResult> {
    const challengeId = randomBytes(32).toString('hex');

    const challengeToken =
      await this.tokenService.generateTwoFactorChallengeToken({
        sub: accountId,
        email,
        challengeId,
      });

    // Comme pour les liens de reset : c'est l'identifiant mémorisé côté serveur,
    // et non la signature, qui rend le challenge consommable une seule fois.
    await this.oneTimeTokens.issue(
      OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE,
      email,
      challengeId,
    );

    await this.challenges.send(email, enrollment);

    return {
      mfaRequired: true,
      method: enrollment.method,
      challengeToken,
    };
  }
}
