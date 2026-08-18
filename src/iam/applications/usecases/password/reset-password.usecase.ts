import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EmailTokenPayload } from 'src/iam/applications/models/auth-token';
import { TokenService } from '../../services/token/token.service';
import { TokenEmailCacheService } from '../../services/token/token-email-cache.service';
import {
  SESSION_STORE,
  type SessionStore,
} from 'src/iam/applications/ports/session-store.port';
import { Password } from 'src/iam/domains/value-objects/password.vo';
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
    private readonly tokenService: TokenService,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    // Deux magasins parce que la réinitialisation touche aux deux : elle
    // consomme le token reçu par email, puis coupe les sessions en cours.
    private readonly emailTokenCache: TokenEmailCacheService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
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
    const isValidToken = await this.emailTokenCache.validateEmailToken(
      payload.email,
      payload.emailTokenId,
      'password_reset',
    );
    if (!isValidToken) {
      throw new InvalidPasswordResetTokenError();
    }
    await this.emailTokenCache.invalidateEmailTokenId(
      payload.email,
      'password_reset',
    );

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new InvalidPasswordResetTokenError('Utilisateur non trouvé');
    }

    // Même politique qu'à l'inscription, portée par le même VO : réinitialiser
    // ne doit pas être une porte dérobée vers un mot de passe plus faible que
    // celui qu'on remplace.
    const newPassword = Password.of(command.newPassword);

    const hashedPassword = await this.hashingService.hash(newPassword.value);
    user.changePassword(hashedPassword);
    await this.userRepository.update(user);
    // Réinitialiser le mot de passe ferme **toutes** les sessions du compte,
    // et non plus la seule qu'il pouvait avoir : depuis le multi-appareil, en
    // oublier une laisserait un appareil connecté avec l'ancien mot de passe —
    // exactement ce dont on cherche à reprendre le contrôle.
    await this.sessions.revoquerToutes(payload.sub);
  }
}
