import { Command } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domain/ports/token.service';

/** Seconde étape du sign-in : le code prouve le second facteur, on délivre les tokens. */
export class VerifyTwoFactorSignInCommand extends Command<AuthTokens> {
  constructor(
    public readonly challengeToken: string,
    public readonly otp: string,
  ) {
    super();
  }
}
