import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AuthSession,
  type RefreshSessionIdentity,
  type TokenPayload,
} from 'src/iam/applications/models/auth-token';
import { TokenService } from '../../services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  AccountClosedError,
  AccountSuspendedError,
  InvalidRefreshTokenError,
} from 'src/iam/domains/errors';
import { projeterAccesPorteur } from 'src/porteur-access/domains/acces-porteur';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';

/**
 * Rafraîchissement de session : renouvelle le couple de tokens **et** rend le
 * compte associé, dans la même forme qu'un sign-in (`AuthSession`). Le front
 * qui reprend une session au démarrage (refresh token en stockage) obtient
 * ainsi le profil à jour sans enchaîner un `GET /users/me` — et voit tout de
 * suite un statut ou un rôle modifiés côté serveur depuis la connexion.
 *
 * ORDRE CRITIQUE (correctif de sécurité) : le compte est relu AVANT l'émission
 * des tokens. Le token entrant ne sert plus qu'à désigner *qui* rafraîchit
 * (`sub`) ; le rôle et le statut qui feront autorité viennent de la base. Sans
 * cela, le rôle du claim était recopié dans le nouveau couple et une
 * rétrogradation d'administrateur ne prenait jamais effet — l'utilisateur
 * conservait ses droits en faisant simplement tourner son refresh token.
 */
@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly mfaFactors: MfaFactorService,
  ) {}

  async execute(refreshToken: string): Promise<AuthSession> {
    let identity: RefreshSessionIdentity;
    try {
      // Consomme le tour de rotation : le token présenté ne vaut plus rien au
      // retour, qu'on émette ensuite de nouveaux tokens ou non.
      identity = await this.tokenService.consumeRefreshToken(refreshToken);
    } catch {
      // Périmètre volontairement étroit : seul l'échec de rotation devient un
      // 401 « token invalide ». Une panne de base sur la relecture du compte,
      // plus bas, doit rester une vraie erreur serveur.
      throw new InvalidRefreshTokenError();
    }

    const user = await this.userRepository.findById(identity.sub);
    if (!user) {
      // Compte supprimé depuis l'émission du refresh token : même réponse
      // qu'un token invalide, pas de session à rouvrir.
      throw new InvalidRefreshTokenError();
    }

    // `POST /auth/refresh-tokens` est public : AccountStatusGuard, qui coupe
    // l'accès des comptes sanctionnés à chaque requête, ne s'y applique pas.
    // Le contrôle est donc fait ici, avec le MÊME contrat d'erreur que le
    // sign-in (codes stables ACCOUNT_SUSPENDED / ACCOUNT_CLOSED) : un compte
    // suspendu, clos ou supprimé n'obtient aucun nouveau token.
    if (user.isSuspended()) {
      throw new AccountSuspendedError();
    }
    if (user.isClosed()) {
      throw new AccountClosedError();
    }

    // Un rafraîchissement réussi est un contact émanant de la personne (barème
    // RGPD ligne 2 : « dernier contact émanant du prospect ») : c'est même le
    // seul signe de vie d'une session longue, où l'on ne repasse jamais par le
    // mot de passe. Posé APRÈS les contrôles de statut — un compte suspendu qui
    // se voit refuser des tokens n'a pas rouvert de session — et sans jamais
    // faire échouer le rafraîchissement (voir `marquerConnexion`).
    await this.marquerConnexion(user.userId);

    // Relu à chaque rafraîchissement, au même titre que le statut et le rôle :
    // un facteur armé ou retiré depuis la connexion doit se voir sur la session
    // reprise, sans quoi le front garderait l'état du jour où elle a été
    // ouverte.
    const activeMfaMethod = await this.mfaFactors.findActiveMethod(user.userId);

    // Le nouveau couple porte le rôle EN BASE, jamais celui du claim entrant.
    // L'adresse suit la même règle ; le repli sur celle du token ne couvre que
    // le cas limite d'un compte sans ligne `user_emails` (le getter rend alors
    // une chaîne vide), qui produirait une clé de session ambiguë en cache.
    const tokens = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.email || identity.email,
      role: user.role,
    } as TokenPayload);

    // Relu au même titre que le statut, le rôle et le facteur : un accès
    // porteur ACCORDÉ ou RETIRÉ depuis la connexion doit se voir sur la session
    // reprise. C'est ce qui rend le retrait perceptible côté front dès la
    // rotation suivante — la révocation de session force précisément celle-ci.
    const accesPorteur = await this.userRepository.findAccesPorteur(
      user.userId,
    );

    // `toJSON()` est la seule projection publiable — l'empreinte du mot de
    // passe en est exclue par construction (PublicUser).
    return {
      user: user.toJSON(
        {
          enabled: activeMfaMethod !== null,
          method: activeMfaMethod,
        },
        projeterAccesPorteur(accesPorteur),
      ),
      ...tokens,
    };
  }

  /**
   * Horodate le rafraîchissement — sans jamais le faire échouer. Même contrat
   * que `SignInUsecase.marquerConnexion` : une trace ne prend pas une session
   * en otage.
   */
  private async marquerConnexion(userId: number): Promise<void> {
    try {
      await this.userRepository.touchLastLogin(userId, new Date());
    } catch (error) {
      this.logger.warn(
        `lastLoginAt non écrit pour le compte #${userId} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
