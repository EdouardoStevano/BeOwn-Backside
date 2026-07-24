import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  TOKEN_SERVICE,
  TokenPayload,
  type TokenService,
} from 'src/iam/domains/ports/token.service';
import { SignInDto } from '../../../../presenters/http/dto/sign-in.dto';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';
import {
  ACCOUNT_CLOSED_CODE,
  ACCOUNT_CLOSED_MESSAGE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
  OTP_REQUIRED_CODE,
  OTP_REQUIRED_MESSAGE,
} from 'src/common/auth/account-status.guard';

@Injectable()
export class SignInUsecase {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
  ) {}

  async signIn(signInDto: SignInDto) {
    const user = await this.usersRepository.findByEmail(signInDto.email);

    if (!user) {
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect');
    }

    const isValidPassword = await this.hashingService.compare(
      signInDto.password,
      user.password!,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect');
    }

    // Anti-enumeration: OTP_REQUIRED / ACCOUNT_SUSPENDED / ACCOUNT_CLOSED
    // are only checked *after* the password has matched. These codes are
    // more informative than the generic "invalid credentials" message, so
    // if they fired before the password check, anyone who merely knows (or
    // guesses) an email address could learn that account's verification or
    // suspension status without ever supplying a correct password. Gating
    // them behind a successful password check means this detail only
    // reaches someone who already holds valid credentials for the account.
    if (!user.userEmail.isVerified) {
      throw new UnauthorizedException({
        code: OTP_REQUIRED_CODE,
        message: OTP_REQUIRED_MESSAGE,
      });
    }

    // Un compte suspendu/clos/supprimé ne doit jamais pouvoir se reconnecter,
    // sinon il obtiendrait un nouveau JWT valide malgré la sanction — même
    // contrat d'erreur (401 + code stable) que le contrôle par requête fait
    // par AccountStatusGuard, pour une expérience front cohérente.
    if (user.status === UserStatus.SUSPENDU) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: ACCOUNT_SUSPENDED_MESSAGE,
        code: ACCOUNT_SUSPENDED_CODE,
      });
    }

    if (
      user.status === UserStatus.CLOS ||
      user.status === UserStatus.SUPPRIME
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: ACCOUNT_CLOSED_MESSAGE,
        code: ACCOUNT_CLOSED_CODE,
      });
    }

    const tokenPayload = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
      role: user.role,
    } as TokenPayload);

    return { ...tokenPayload };
  }
}
