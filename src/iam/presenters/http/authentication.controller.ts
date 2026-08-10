import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SignInUsecase } from '../../applications/authentication/usecases/sign-in.usecase';
import { SignInDto } from './dto/sign-in.dto';
import { ExchangeCodeDto, RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokenUseCase } from '../../applications/authentication/usecases/refresh-token.usecase';
import { IssueOAuthCodeUseCase } from '../../applications/authentication/usecases/issue-oauth-code.usecase';
import { ExchangeOAuthCodeUseCase } from '../../applications/authentication/usecases/exchange-oauth-code.usecase';
import { ForgotPasswordUseCase } from '../../applications/authentication/usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from '../../applications/authentication/usecases/reset-password.usecase';
import { FacebookAuthGuard } from '../guards/facebook-auth.guard';
import { FacebookCallbackGuard } from '../guards/facebook-callback.guard';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { GoogleCallbackGuard } from '../guards/google-callback.guard';
import { LinkedinAuthGuard } from '../guards/linkedin-auth.guard';
import { LinkedinCallbackGuard } from '../guards/linkedin-callback.guard';
import type { AuthenticatedSocialUser } from '../guards/oauth-redirect-cookie';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignUpDto,
} from './dto/password.dto';
import { RegisterUseCase } from 'src/iam/applications/authentication/usecases/register.usecase';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { Public } from 'src/common/auth/public.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly signInUsecase: SignInUsecase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly issueOAuthCodeUseCase: IssueOAuthCodeUseCase,
    private readonly exchangeOAuthCodeUseCase: ExchangeOAuthCodeUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly registerUseCase: RegisterUseCase,
    private readonly recaptchaService: RecaptchaService,
  ) {}

  @ApiOperation({ summary: 'Connexion avec email et mot de passe' })
  @ApiResponse({
    status: 200,
    description:
      'Session ouverte : accessToken, refreshToken et le compte (user)',
  })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({
    status: 429,
    description: 'Trop de tentatives — réessayez dans 15 min',
  })
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() dto: SignInDto) {
    return this.signInUsecase.execute(dto);
  }

  @ApiOperation({ summary: "Rafraîchir les tokens d'accès" })
  @ApiResponse({
    status: 200,
    description:
      'Nouveaux tokens (accessToken, refreshToken) accompagnés du compte (user) — même forme de réponse que sign-in.',
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.refreshTokenUseCase.execute(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Authentification via Facebook' })
  @Public()
  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookAuthenticate() {}

  @ApiOperation({ summary: 'Callback Facebook OAuth' })
  @Public()
  @Get('facebook/callback')
  @UseGuards(FacebookCallbackGuard)
  facebookCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as AuthenticatedSocialUser);
  }

  @ApiOperation({ summary: 'Authentification via Google' })
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuthenticate() {}

  @ApiOperation({ summary: 'Callback Google OAuth' })
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleCallbackGuard)
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as AuthenticatedSocialUser);
  }

  @ApiOperation({ summary: 'Authentification via LinkedIn' })
  @Public()
  @Get('linkedin')
  @UseGuards(LinkedinAuthGuard)
  linkedinAuthenticate() {}

  @ApiOperation({ summary: 'Callback LinkedIn OAuth' })
  @Public()
  @Get('linkedin/callback')
  @UseGuards(LinkedinCallbackGuard)
  linkedinCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as AuthenticatedSocialUser);
  }

  @ApiOperation({
    summary: 'Échange un code OAuth contre des tokens (usage unique, 30s)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Session ouverte : accessToken, refreshToken et le compte (user)',
  })
  @ApiResponse({ status: 401, description: 'Code invalide ou expiré' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  exchange(@Body() dto: ExchangeCodeDto) {
    return this.exchangeOAuthCodeUseCase.execute(dto.code);
  }

  /**
   * Seule responsabilité restante côté présentation : choisir l'URL de retour
   * (front vs back-office) et rediriger. L'authentification et l'émission du
   * code à usage unique appartiennent à `IssueOAuthCodeUseCase`.
   */
  private async redirectWithCode(
    res: Response,
    user: AuthenticatedSocialUser | undefined,
  ) {
    const target =
      user?._redirectTo === 'admin'
        ? (process.env.ADMIN_URL ?? 'http://localhost:5174')
        : (process.env.FRONTEND_URL ?? 'http://localhost:5173');

    if (!user) {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Connexion annulée ou refusée')}`,
      );
    }

    try {
      const { code, isNewUser } =
        await this.issueOAuthCodeUseCase.execute(user);
      return res.redirect(
        `${target}/auth/oauth-callback?code=${code}&isNewUser=${isNewUser ? '1' : '0'}`,
      );
    } catch {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Authentification échouée')}`,
      );
    }
  }

  @ApiOperation({ summary: 'Inscription (sign-up)' })
  @ApiResponse({
    status: 201,
    description:
      "Compte créé avec succès (statut CREE). Un email contenant le lien de vérification part automatiquement ; il mène à GET /email/verify?token=… qui fait passer le compte à EMAIL_VERIFIE. En cas d'échec d'envoi, l'inscription réussit tout de même et le lien peut être redemandé via POST /email/send-verification.",
  })
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Public()
  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto) {
    await this.recaptchaService.verify(dto.captchaToken);
    const user = await this.registerUseCase.execute(dto);
    // `toJSON()` exclut l'empreinte du mot de passe — l'ancien étalement
    // exposerait désormais le champ privé `_passwordHash`.
    return user.toJSON();
  }

  @ApiOperation({ summary: 'Mot de passe oublié' })
  @ApiResponse({
    status: 204,
    description: 'Email de réinitialisation envoyé si le compte existe',
  })
  @Throttle({ auth: { ttl: 3_600_000, limit: 50 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.forgotPasswordUseCase.execute(dto.email);
  }

  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiResponse({
    status: 200,
    description: 'Mot de passe réinitialisé avec succès',
  })
  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.resetPasswordUseCase.execute(dto);
  }
}
