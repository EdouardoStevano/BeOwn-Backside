import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthSession,
  type AuthTokens,
} from 'src/iam/applications/models/auth-token';
import { TokenService } from '../../services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { InvalidRefreshTokenError } from 'src/iam/domains/errors';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';

/**
 * Rafraîchissement de session : renouvelle le couple de tokens **et** rend le
 * compte associé, dans la même forme qu'un sign-in (`AuthSession`). Le front
 * qui reprend une session au démarrage (refresh token en stockage) obtient
 * ainsi le profil à jour sans enchaîner un `GET /users/me` — et voit tout de
 * suite un statut ou un rôle modifiés côté serveur depuis la connexion.
 */
@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly mfaFactors: MfaFactorService,
  ) {}

  async execute(refreshToken: string): Promise<AuthSession> {
    let tokens: AuthTokens;
    try {
      tokens = await this.tokenService.refreshTokens(refreshToken);
    } catch {
      // Périmètre volontairement étroit : seul l'échec de rotation devient un
      // 401. Une panne de base sur la relecture du compte, plus bas, doit
      // rester une vraie erreur serveur et non se déguiser en token invalide.
      throw new InvalidRefreshTokenError();
    }

    // L'identité est relue depuis le token qui vient d'être émis, pas depuis
    // celui reçu : c'est la session effectivement ouverte qui fait foi.
    const { sub } = await this.tokenService.verifyAccessToken(
      tokens.accessToken,
    );

    const user = await this.userRepository.findById(sub);
    if (!user) {
      // Compte supprimé depuis l'émission du refresh token : même réponse
      // qu'un token invalide, pas de session à rouvrir.
      throw new InvalidRefreshTokenError();
    }

    // Relu à chaque rafraîchissement, au même titre que le statut et le rôle :
    // un facteur armé ou retiré depuis la connexion doit se voir sur la session
    // reprise, sans quoi le front garderait l'état du jour où elle a été
    // ouverte.
    const activeMfaMethod = await this.mfaFactors.findActiveMethod(sub);

    // `toJSON()` est la seule projection publiable — l'empreinte du mot de
    // passe en est exclue par construction (PublicUser).
    return {
      user: user.toJSON({
        enabled: activeMfaMethod !== null,
        method: activeMfaMethod,
      }),
      ...tokens,
    };
  }
}
