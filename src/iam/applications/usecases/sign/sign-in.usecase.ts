import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  type AuthSession,
  TokenPayload,
} from 'src/iam/applications/models/auth-token';
import { TokenService } from '../../services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  AccountClosedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  MfaRequiredError,
} from 'src/iam/domains/errors';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaChallengePurpose } from 'src/iam/applications/models/mfa-challenge';
import { MFAChallengeCacheService } from '../../services/mfa/mfa-challenge-cache.service';
import { User } from 'src/iam/domains/models/user';
import { projeterAccesPorteur } from 'src/porteur-access/domains/acces-porteur';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface SignInCommand {
  email: string;
  password: string;
}

@Injectable()
export class SignInUsecase {
  private readonly logger = new Logger(SignInUsecase.name);

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

    if (!user) {
      throw new InvalidCredentialsError();
    }

    // L'empreinte ne sort jamais de l'entité : on lui prête seulement de quoi
    // comparer. Un compte social sans mot de passe échoue ici proprement, là
    // où le `user.password!` précédent déréférençait un null.
    const isValidPassword = await user.verifyPassword(
      command.password,
      (plain, hash) => this.hashingService.compare(plain, hash),
    );

    if (!isValidPassword) {
      throw new InvalidCredentialsError();
    }

    // Anti-enumeration: OTP_REQUIRED / ACCOUNT_SUSPENDED / ACCOUNT_CLOSED
    // are only checked *after* the password has matched. These codes are
    // more informative than the generic "invalid credentials" message, so
    // if they fired before the password check, anyone who merely knows (or
    // guesses) an email address could learn that account's verification or
    // suspension status without ever supplying a correct password. Gating
    // them behind a successful password check means this detail only
    // reaches someone who already holds valid credentials for the account.
    if (!user.isEmailVerified()) {
      throw new EmailNotVerifiedError();
    }

    // Un compte suspendu/clos/supprimé ne doit jamais pouvoir se reconnecter,
    // sinon il obtiendrait un nouveau JWT valide malgré la sanction — même
    // contrat d'erreur (401 + code stable) que le contrôle par requête fait
    // par AccountStatusGuard, pour une expérience front cohérente.
    if (user.isSuspended()) {
      throw new AccountSuspendedError();
    }

    if (user.isClosed()) {
      throw new AccountClosedError();
    }

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
    // Dernier contact émanant de la personne (barème RGPD ligne 2) : posé ICI
    // et non dans `execute`, pour que les deux chemins qui ouvrent une session
    // — mot de passe seul et second facteur éprouvé — le posent une fois et une
    // seule. Une tentative refusée n'est pas un contact : rien n'est écrit tant
    // que la session n'est pas réellement ouverte.
    await this.marquerConnexion(user.userId);

    const tokens = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.email,
      role: user.role,
    } as TokenPayload);

    // Accès porteur : lecture CIBLÉE, hors agrégat (ADR § 3). Le front reçoit
    // le profil complet à l'ouverture de session, sélecteur d'espace compris —
    // sans quoi l'espace porteur n'apparaîtrait qu'après un GET /users/me.
    // Une lecture de plus par CONNEXION (pas par requête), sur la clé primaire.
    const accesPorteur = await this.usersRepository.findAccesPorteur(
      user.userId,
    );

    // Le compte accompagne les tokens : le front dispose du profil sans
    // enchaîner un GET /users/me juste après la connexion. `toJSON()` est la
    // seule projection publiable — l'empreinte du mot de passe en est exclue.
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
   * Horodate la connexion — sans jamais la faire échouer.
   *
   * L'écriture est une TRACE, pas une étape de l'authentification : refuser une
   * session parce qu'un UPDATE d'une colonne a échoué serait échanger une
   * indisponibilité contre une commodité. L'échec est journalisé en
   * avertissement, ce qui le rend visible sans le rendre bloquant — et le
   * `COALESCE` de la purge continue de couvrir la ligne en attendant.
   */
  private async marquerConnexion(userId: number): Promise<void> {
    try {
      await this.usersRepository.touchLastLogin(userId, new Date());
    } catch (error) {
      this.logger.warn(
        `lastLoginAt non écrit pour le compte #${userId} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
