import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import {
  TOKEN_SERVICE,
  type AuthTokens,
  type TokenService,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { CreateEmailOtpUseCase } from 'src/iam/applications/otp/applications/usecases/create-email-otp.usecase';
import { CreateTotpUseCase } from 'src/iam/applications/otp/applications/usecases/create-totp.usecase';
import { UserStatus } from 'src/users/domains/user';

export type TwoFactorMethod = 'email' | 'totp';

export class SendTwoFactorCodeDto {
  @ApiProperty({ description: 'Jeton pré-authentifié renvoyé par /auth/sign-in' })
  @IsString()
  @IsNotEmpty()
  preAuthToken: string;
}

export class VerifyTwoFactorDto {
  @ApiProperty({ description: 'Jeton pré-authentifié renvoyé par /auth/sign-in' })
  @IsString()
  @IsNotEmpty()
  preAuthToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 10)
  otp: string;

  @ApiPropertyOptional({ enum: ['email', 'totp'], default: 'email' })
  @IsOptional()
  @IsIn(['email', 'totp'])
  method?: TwoFactorMethod;
}

/**
 * Échange d'un jeton pré-authentifié contre de vrais tokens, après validation
 * du second facteur.
 *
 * C'est la moitié serveur du correctif : `signIn` s'arrête au jeton pré-auth
 * pour un compte 2FA-activée, et seule cette classe délivre un access token.
 * Le contrôle ne peut donc plus être contourné depuis le navigateur.
 *
 * Méthodes couvertes : email (défaut) et TOTP. Le SMS n'est pas géré ici — le
 * numéro ne vit pas sur l'utilisateur mais sur son profil — ; un compte
 * configuré en SMS retombe sur l'email, toujours disponible.
 */
@Injectable()
export class VerifyTwoFactorUseCase {
  private readonly logger = new Logger(VerifyTwoFactorUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly emailOtpUseCase: CreateEmailOtpUseCase,
    private readonly totpUseCase: CreateTotpUseCase,
  ) {}

  /** Envoie (ou renvoie) le code par email au titulaire du jeton pré-auth. */
  async sendCode(dto: SendTwoFactorCodeDto): Promise<void> {
    const { email } = await this.readPreAuth(dto.preAuthToken);
    await this.emailOtpUseCase.send({ email });
  }

  async verify(dto: VerifyTwoFactorDto): Promise<AuthTokens> {
    const { sub: userId, email } = await this.readPreAuth(dto.preAuthToken);

    const method: TwoFactorMethod = dto.method ?? 'email';
    const isValid =
      method === 'totp'
        ? await this.totpUseCase.verify(userId, { otp: dto.otp } as any)
        : await this.emailOtpUseCase.verify({ email, otp: dto.otp });

    if (!isValid) {
      this.logger.warn(`2FA: code invalide (userId=${userId}, method=${method})`);
      throw new UnauthorizedException('Code invalide ou expiré.');
    }

    // Le compte a pu être suspendu/supprimé entre la saisie du mot de passe et
    // celle du code : on revalide avant d'émettre un token de session.
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Session invalide, reconnectez-vous.');
    }
    if (
      user.status === UserStatus.SUSPENDU ||
      user.status === UserStatus.CLOS ||
      user.status === UserStatus.SUPPRIME
    ) {
      throw new UnauthorizedException('Ce compte n’est plus accessible.');
    }

    return this.tokenService.generateTokens({
      sub: userId,
      email,
      role: user.role,
      refreshTokenId: null,
    });
  }

  /** Un jeton absent, expiré ou d'un autre type renvoie toujours la même 401. */
  private async readPreAuth(token: string) {
    try {
      return await this.tokenService.verifyPreAuthToken(token);
    } catch {
      throw new UnauthorizedException(
        'Session de connexion expirée, veuillez recommencer.',
      );
    }
  }
}