import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
} from 'src/iam/domains/ports/token.port';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cache-manager.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import { InvalidPasswordResetTokenError } from 'src/iam/domains/errors';

export interface ResetPasswordCommand {
  token: string;
  newPassword: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    let payload: EmailTokenPayload;
    try {
      payload = await this.tokenService.verifyEmailToken(command.token);
    } catch {
      throw new InvalidPasswordResetTokenError();
    }

    // Token-confusion guard (HIGH finding): email-verify and password-reset
    // tokens are both signed EmailTokenPayloads issued from the same JWT
    // secret/claims shape. An email-verification token travels in a GET URL
    // (logged by proxies, browsers, mail clients) and must never be
    // replayable here to take over the account. Tokens issued before this
    // fix carry no `type` claim — rejected rather than assumed
    // `password_reset`, forcing a fresh request (email-token TTL is at most
    // 24h, so the forced re-request window is bounded).
    if (payload.type !== 'password_reset') {
      throw new InvalidPasswordResetTokenError();
    }

    // Single-use, same Redis pattern as email verification: the tokenId was
    // stored at issue time (ForgotPasswordUseCase); check-and-invalidate it
    // here so the same reset link can't be replayed a second time.
    const isValidToken = await this.cacheManagerService.validateEmailToken(
      payload.email,
      payload.emailTokenId,
      'password_reset',
    );
    if (!isValidToken) {
      throw new InvalidPasswordResetTokenError();
    }
    await this.cacheManagerService.invalidateEmailTokenId(
      payload.email,
      'password_reset',
    );

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new InvalidPasswordResetTokenError('Utilisateur non trouvé');
    }

    const hashedPassword = await this.hashingService.hash(command.newPassword);
    user.changePassword(hashedPassword);
    await this.userRepository.update(user);
    // A password reset invalidates every refresh session for the account.
    // (payload.email = l'email du compte porté par le token password_reset,
    // déjà utilisé plus haut pour invalider le token email — le domaine User
    // n'expose pas d'accès direct .email ici.)
    await this.cacheManagerService.invalidateRefreshTokenId(payload.email);
  }
}
