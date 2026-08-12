import { Inject, Injectable } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  type AuthSession,
  TOKEN_SERVICE,
  TokenPayload,
  type TokenService,
} from 'src/iam/domains/ports/token.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import {
  AccountClosedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
} from 'src/iam/domains/errors';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface SignInCommand {
  email: string;
  password: string;
}

@Injectable()
export class SignInUsecase {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
  ) {}

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

    const tokens = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.email,
      role: user.role,
    } as TokenPayload);

    // Le compte accompagne les tokens : le front dispose du profil sans
    // enchaîner un GET /users/me juste après la connexion. `toJSON()` est la
    // seule projection publiable — l'empreinte du mot de passe en est exclue.
    return { user: user.toJSON(), ...tokens };
  }
}
