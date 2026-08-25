import { Inject, Injectable } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/iam/domain/ports/hashing.service';
import {
  type AuthSession,
  TokenPayload,
} from 'src/iam/application/dto/auth-token';
import { TokenService } from '../../services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  InvalidCredentialsError,
  MfaRequiredError,
} from 'src/iam/domain/errors';
import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';
import { MfaChallengePurpose } from 'src/iam/application/dto/mfa-challenge';
import { MFAChallengeCacheService } from '../../services/mfa/mfa-challenge-cache.service';
import { User } from 'src/iam/domain/aggregates/user';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface SignInCommand {
  email: string;
  password: string;
}

@Injectable()
export class SignInUsecase {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly mfaFactors: MfaFactorService,
    private readonly mfaChallenges: MFAChallengeCacheService,
  ) {}

  /**
   * Ouvre une session, ou lève `MfaRequiredError` si un second facteur reste à
   * éprouver. Le type de retour ne dit donc qu'une chose : `AuthSession`. Une
   * union `AuthSession | MfaChallengeRequired` obligeait chaque appelant à
   * rétrécir avant de lire un token ; l'issue « il manque une étape » passe
   * désormais par le canal que tout client traite déjà à part.
   */
  async execute(command: SignInCommand): Promise<AuthSession> {
    const user = await this.usersRepository.findByEmail(command.email);

    // Le compte inexistant est le seul contrôle qui reste ici : il n'y a pas
    // d'agrégat à qui poser la question. Même erreur que le mot de passe faux,
    // précisément pour qu'on ne puisse pas distinguer les deux cas.
    if (!user) {
      throw new InvalidCredentialsError();
    }

    // Tout ce qui conditionne l'ouverture d'une session en une question posée
    // au compte : empreinte, adresse vérifiée, ni suspendu ni fermé.
    // L'ordre de ces contrôles est une règle de sécurité — anti-énumération —
    // et il est énoncé dans l'agrégat, avec sa raison. L'empreinte, elle, ne
    // sort jamais de l'entité : on lui prête seulement de quoi comparer.
    await user.assertPeutOuvrirSession(command.password, (plain, hash) =>
      this.hashingService.compare(plain, hash),
    );

    // Le second facteur n'est éprouvé qu'ici, une fois le mot de passe validé
    // et le compte jugé en état d'ouvrir une session : émettre un challenge
    // plus tôt enverrait un SMS à qui saisit une adresse au hasard, et
    // révélerait au passage qu'elle correspond à un compte.
    const method = await this.mfaFactors.findActiveMethod(user.userId);
    if (method) {
      const { sentTo } = await this.mfaFactors
        .strategyFor(method)
        .issue(user.userId);

      const challenge = await this.mfaChallenges.issue({
        userId: user.userId,
        method,
        purpose: MfaChallengePurpose.SIGN_IN,
        sentTo,
      });

      // Ni tokens ni profil tant que le facteur n'est pas prouvé : le mot de
      // passe seul ne doit rien donner à voir du compte. L'erreur ne porte donc
      // que de quoi relever le défi — id, canal, destination masquée.
      throw new MfaRequiredError({
        challengeId: challenge.id,
        method,
        sentTo,
      });
    }

    // `method` vaut forcément `null` ici : la branche ci-dessus est sortie.
    return this.openSession(user, method);
  }

  /**
   * Délivre les tokens et le profil. Extrait pour que
   * `CompleteMfaSignInUseCase` referme exactement la même connexion à l'issue
   * du second facteur — deux chemins vers une session, une seule façon de
   * l'ouvrir.
   *
   * `activeMfaMethod` est un paramètre et non une relecture : les deux
   * appelants viennent de l'établir — l'un en cherchant s'il fallait opposer un
   * facteur, l'autre en en éprouvant un. Le redemander ferait jusqu'à trois
   * requêtes de plus par connexion pour une réponse déjà connue. Explicite
   * plutôt qu'optionnel : un appelant qui ne sait pas doit se poser la
   * question, pas hériter d'un `false` par défaut.
   */
  async openSession(
    user: User,
    activeMfaMethod: MfaMethodType | null,
  ): Promise<AuthSession> {
    const tokens = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.email,
      role: user.role,
    } as TokenPayload);

    // Le compte accompagne les tokens : le front dispose du profil sans
    // enchaîner un GET /users/me juste après la connexion. `toJSON()` est la
    // seule projection publiable — l'empreinte du mot de passe en est exclue.
    return {
      user: user.toJSON({
        enabled: activeMfaMethod !== null,
        method: activeMfaMethod,
      }),
      ...tokens,
    };
  }
}
