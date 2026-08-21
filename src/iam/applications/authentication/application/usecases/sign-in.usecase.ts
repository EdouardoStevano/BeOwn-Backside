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
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

@Injectable()
export class SignInUsecase {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly metrics: MetricsPort,
  ) {}

  async signIn(signInDto: SignInDto) {
    const user = await this.usersRepository.findByEmail(signInDto.email);

    if (!user) {
      this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, {
        outcome: 'failure',
        reason: 'invalid_credentials',
      });
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect');
    }

    const isValidPassword = await this.hashingService.compare(
      signInDto.password,
      user.password!,
    );

    if (!isValidPassword) {
      this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, {
        outcome: 'failure',
        reason: 'invalid_credentials',
      });
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
      this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, {
        outcome: 'failure',
        reason: 'otp_required',
      });
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
      this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, {
        outcome: 'failure',
        reason: 'account_suspended',
      });
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
      this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, {
        outcome: 'failure',
        reason: 'account_closed',
      });
      throw new UnauthorizedException({
        statusCode: 401,
        message: ACCOUNT_CLOSED_MESSAGE,
        code: ACCOUNT_CLOSED_CODE,
      });
    }

    // Second facteur : contrôlé ICI, et non par l'interface. Tant que le code
    // n'est pas vérifié, aucun access token n'est émis — seul un jeton
    // pré-authentifié sans droits est renvoyé, à échanger via /auth/2fa/verify.
    // Placé après le mot de passe et le statut : un mot de passe erroné ne doit
    // pas révéler que le compte a la 2FA activée (même logique anti-énumération
    // que les codes OTP_REQUIRED / ACCOUNT_* ci-dessus).
    const preferences = await this.usersRepository
      .findPreferences(user.userId)
      .catch(() => null);

    if (preferences?.twoFactorEnabled) {
      const preAuthToken = await this.tokenService.generatePreAuthToken(
        user.userId,
        user.userEmail.email,
      );
      this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, {
        outcome: 'pending_2fa',
      });
      return { requires2fa: true as const, preAuthToken };
    }

    const tokenPayload = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
      role: user.role,
    } as TokenPayload);

    this.metrics.incrementCounter(METRIC.SIGNIN_TOTAL, { outcome: 'success' });
    return { ...tokenPayload };
  }
}
