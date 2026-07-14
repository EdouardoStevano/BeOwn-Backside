import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  type TokenService,
  AuthTokens,
  TwoFactorChallengePayload,
} from 'src/iam/domain/ports/token.service';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  TWO_FACTOR_GATEWAY,
  type TwoFactorGateway,
} from 'src/iam/domain/ports/two-factor.gateway';
import {
  ONE_TIME_TOKEN_STORE,
  OneTimeTokenPurpose,
  type OneTimeTokenStore,
} from 'src/iam/domain/ports/one-time-token.store';
import {
  InvalidCredentialsError,
  InvalidOtpError,
  InvalidTwoFactorChallengeError,
} from 'src/iam/domain/errors/iam.errors';
import { TwoFactorChallengeService } from 'src/iam/application/two-factor/two-factor-challenge.service';
import { VerifyTwoFactorSignInCommand } from './verify-two-factor-sign-in.command';

@CommandHandler(VerifyTwoFactorSignInCommand)
export class VerifyTwoFactorSignInHandler implements ICommandHandler<VerifyTwoFactorSignInCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(TWO_FACTOR_GATEWAY) private readonly twoFactor: TwoFactorGateway,
    @Inject(ONE_TIME_TOKEN_STORE)
    private readonly oneTimeTokens: OneTimeTokenStore,
    private readonly challenges: TwoFactorChallengeService,
  ) {}

  async execute(command: VerifyTwoFactorSignInCommand): Promise<AuthTokens> {
    const payload = await this.verifyChallenge(command.challengeToken);

    const enrollment = await this.twoFactor.findActive(payload.email);
    if (!enrollment) {
      // La 2FA a été désactivée entre les deux étapes : le challenge ne veut
      // plus rien dire, on repart d'un sign-in propre.
      throw new InvalidTwoFactorChallengeError();
    }

    const isValid = await this.challenges.verify(
      payload.email,
      enrollment,
      command.otp,
    );
    // Le challenge n'est pas consommé sur un code faux : la limite de tentatives
    // est déjà tenue par l'OtpService, et invalider ici forcerait à ressaisir
    // son mot de passe à la moindre faute de frappe.
    if (!isValid) throw new InvalidOtpError();

    await this.oneTimeTokens.consume(
      OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE,
      payload.email,
    );

    const account = await this.accounts.findByEmail(payload.email);
    if (!account) throw new InvalidCredentialsError();

    account.ensureCanSignIn();

    return this.tokenService.generateTokens({
      sub: account.accountId,
      email: account.email,
      role: account.role,
    });
  }

  private async verifyChallenge(
    token: string,
  ): Promise<TwoFactorChallengePayload> {
    let payload: TwoFactorChallengePayload;
    try {
      payload = await this.tokenService.verifyTwoFactorChallengeToken(token);
    } catch {
      // Signature invalide, jeton expiré, ou jeton d'un autre type : le client
      // n'a pas à savoir lequel des trois.
      throw new InvalidTwoFactorChallengeError();
    }

    // Le jeton est signé, mais l'a-t-il déjà consommé ? Seul le store le sait.
    const isPending = await this.oneTimeTokens.isPending(
      OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE,
      payload.email,
      payload.challengeId,
    );
    if (!isPending) throw new InvalidTwoFactorChallengeError();

    return payload;
  }
}
