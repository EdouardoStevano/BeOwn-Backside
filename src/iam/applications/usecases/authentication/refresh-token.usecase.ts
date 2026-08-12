import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthSession,
  type AuthTokens,
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domains/ports/token.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { InvalidRefreshTokenError } from 'src/iam/domains/errors';

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
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
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

    // `toJSON()` est la seule projection publiable — l'empreinte du mot de
    // passe en est exclue par construction (PublicUser).
    return { user: user.toJSON(), ...tokens };
  }
}
