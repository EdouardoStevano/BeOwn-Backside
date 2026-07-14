import { Command } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domain/ports/token.service';
import { TwoFactorMethod } from 'src/iam/domain/ports/two-factor.gateway';

/**
 * Ce que renvoie un sign-in dont le mot de passe est bon mais qui n'est pas
 * terminé : le compte a un second facteur. Aucun token n'est délivré ici.
 */
export interface TwoFactorChallengeIssued {
  mfaRequired: true;
  method: TwoFactorMethod;
  /** À rejouer sur /auth/sign-in/verify-otp avec le code. Valable 5 minutes. */
  challengeToken: string;
}

export type SignInResult = AuthTokens | TwoFactorChallengeIssued;

export class SignInCommand extends Command<SignInResult> {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
