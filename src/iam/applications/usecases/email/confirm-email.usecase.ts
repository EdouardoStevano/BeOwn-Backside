import { Inject, Injectable } from '@nestjs/common';
import { TokenService } from '../../services/token/token.service';
import { TokenEmailCacheService } from '../../services/token/token-email-cache.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  EmailVerificationTokenTypeError,
  InvalidEmailVerificationTokenError,
} from 'src/iam/domains/errors';

export interface ConfirmEmailResult {
  /** Adresse confirmée — affichée par la page de confirmation. */
  email: string;
}

@Injectable()
export class ConfirmEmailUseCase {
  constructor(
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly emailTokenCache: TokenEmailCacheService,
  ) {}

  async execute(token: string): Promise<ConfirmEmailResult> {
    try {
      const emailTokenPayload = await this.tokenService.verifyEmailToken(token);

      // Token-confusion guard: email-verify and password-reset tokens are
      // both signed EmailTokenPayloads and used to be interchangeable at
      // verification time. A password-reset token is delivered the same way
      // (link in an email) but must never be usable to verify an email
      // (and, symmetrically, ResetPasswordUseCase rejects this token type).
      // Tokens issued before this fix carry no `type` claim at all — they
      // are rejected rather than assumed to be `email_verify`, forcing a
      // fresh request; acceptable since the email-token TTL is at most 24h.
      if (emailTokenPayload.type !== 'email_verify') {
        throw new EmailVerificationTokenTypeError();
      }

      const isValidToken = await this.emailTokenCache.validateEmailToken(
        emailTokenPayload.email,
        emailTokenPayload.emailTokenId,
        'email_verify',
      );

      if (isValidToken) {
        await this.emailTokenCache.invalidateEmailTokenId(
          emailTokenPayload.email,
          'email_verify',
        );
      } else {
        throw new InvalidEmailVerificationTokenError();
      }

      const user = await this.usersRepository.findByEmail(
        emailTokenPayload.email,
      );

      if (!user) {
        throw new InvalidEmailVerificationTokenError();
      }

      // Vérifie l'adresse ET fait avancer CREE → EMAIL_VERIFIE : les deux
      // sont indissociables, l'entité les applique ensemble.
      user.markEmailAsVerified();

      await this.usersRepository.update(user);

      return { email: user.email };
    } catch (err) {
      // Preserve the 401 raised above for a type mismatch — everything else
      // (bad signature, expired JWT, unknown user, single-use replay) stays
      // a generic 400 so a caller can't distinguish the failure reason.
      if (err instanceof EmailVerificationTokenTypeError) {
        throw err;
      }
      throw new InvalidEmailVerificationTokenError();
    }
  }
}
