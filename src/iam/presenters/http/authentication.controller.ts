import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type ConfigType } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { SignInCommand } from 'src/iam/application/authentication/commands/sign-in.command';
import { VerifyTwoFactorSignInCommand } from 'src/iam/application/authentication/commands/verify-two-factor-sign-in.command';
import { RefreshTokenCommand } from 'src/iam/application/authentication/commands/refresh-token.command';
import {
  SocialAuthCommand,
  SocialAuthResult,
} from 'src/iam/application/authentication/commands/social-auth.command';
import { ForgotPasswordCommand } from 'src/iam/application/authentication/commands/forgot-password.command';
import { ResetPasswordCommand } from 'src/iam/application/authentication/commands/reset-password.command';
import { SignUpCommand } from 'src/iam/application/authentication/commands/sign-up.command';
import { ExchangeOAuthCodeQuery } from 'src/iam/application/authentication/queries/exchange-oauth-code.query';
import { SocialProfile } from 'src/iam/domain/models/social-profile';
import { FacebookAuthGuard } from 'src/iam/infrastructure/guards/facebook-auth.guard';
import { FacebookCallbackGuard } from 'src/iam/infrastructure/guards/facebook-callback.guard';
import { GoogleAuthGuard } from 'src/iam/infrastructure/guards/google-auth.guard';
import { GoogleCallbackGuard } from 'src/iam/infrastructure/guards/google-callback.guard';
import { LinkedinAuthGuard } from 'src/iam/infrastructure/guards/linkedin-auth.guard';
import { LinkedinCallbackGuard } from 'src/iam/infrastructure/guards/linkedin-callback.guard';
import appUrlsConfig from 'src/iam/infrastructure/config/app-urls.config';
import { SignInDto, VerifyTwoFactorSignInDto } from './dto/sign-in.dto';
import { ExchangeCodeDto, RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignUpDto,
} from './dto/password.dto';
import {
  ResendRegistrationOtpDto,
  VerifyRegistrationOtpDto,
} from './dto/registration-otp.dto';
import {
  ResendRegistrationOtpCommand,
  VerifyRegistrationOtpCommand,
} from 'src/iam/application/registration-otp/commands/registration-otp.commands';

/** Le profil social déposé par Passport, plus l'indice de redirection du guard. */
type OAuthRequestUser = SocialProfile & { _redirectTo?: 'admin' };

@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(appUrlsConfig.KEY)
    private readonly urls: ConfigType<typeof appUrlsConfig>,
  ) {}

  @ApiOperation({
    summary: 'Connexion avec email et mot de passe',
    description:
      "Si le compte a une double authentification active, aucun token n'est " +
      'délivré ici : la réponse porte { mfaRequired: true, method, challengeToken } ' +
      "et le code est envoyé (email/SMS) ou attendu depuis l'application (TOTP). " +
      'Le client enchaîne alors sur POST /auth/sign-in/verify-otp.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Tokens retournés, ou challenge 2FA si un second facteur est actif',
  })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({
    status: 429,
    description: 'Trop de tentatives — réessayez dans 15 min',
  })
  @Throttle({ auth: { ttl: 900_000, limit: 500 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() dto: SignInDto) {
    return this.commandBus.execute(new SignInCommand(dto.email, dto.password));
  }

  @ApiOperation({
    summary:
      'Seconde étape du sign-in : vérifier le code de double authentification',
  })
  @ApiResponse({ status: 200, description: 'Tokens retournés avec succès' })
  @ApiResponse({ status: 400, description: 'Code invalide' })
  @ApiResponse({
    status: 401,
    description: 'Challenge inconnu, expiré, ou déjà consommé',
  })
  @Throttle({ auth: { ttl: 900_000, limit: 500 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in/verify-otp')
  verifyTwoFactorSignIn(@Body() dto: VerifyTwoFactorSignInDto) {
    return this.commandBus.execute(
      new VerifyTwoFactorSignInCommand(dto.challengeToken, dto.otp),
    );
  }

  @ApiOperation({ summary: 'Inscription (sign-up)' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès' })
  @Throttle({ auth: { ttl: 900_000, limit: 200 } })
  @Public()
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.commandBus.execute(
      new SignUpCommand(
        dto.firstname,
        dto.lastname ?? null,
        dto.email,
        dto.password,
        dto.captchaToken,
      ),
    );
  }

  @ApiOperation({ summary: "Rafraîchir les tokens d'accès" })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens retournés' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  @Throttle({ medium: { ttl: 60_000, limit: 500 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.commandBus.execute(new RefreshTokenCommand(dto.refreshToken));
  }

  @ApiOperation({
    summary: "Vérifier le code OTP d'inscription et activer le compte",
  })
  @ApiResponse({
    status: 200,
    description:
      'Compte vérifié — tokens de session retournés (même forme que sign-in)',
  })
  @ApiResponse({
    status: 401,
    description: 'Code invalide, expiré, ou trop de tentatives',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyRegistrationOtpDto) {
    return this.commandBus.execute(
      new VerifyRegistrationOtpCommand(dto.email, dto.code),
    );
  }

  @ApiOperation({
    summary:
      "Renvoyer le code OTP d'inscription (email par défaut, sms en option)",
  })
  @ApiResponse({
    status: 204,
    description:
      'Code renvoyé si le compte existe et reste à vérifier (réponse générique)',
  })
  @ApiResponse({
    status: 400,
    description: 'Canal sms demandé sans numéro de téléphone associé',
  })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-otp')
  resendOtp(@Body() dto: ResendRegistrationOtpDto) {
    return this.commandBus.execute(
      new ResendRegistrationOtpCommand(dto.email, dto.canal ?? 'email'),
    );
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
    return this.commandBus.execute(new ForgotPasswordCommand(dto.email));
  }

  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiResponse({
    status: 200,
    description: 'Mot de passe réinitialisé avec succès',
  })
  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.commandBus.execute(
      new ResetPasswordCommand(dto.token, dto.newPassword),
    );
  }

  @ApiOperation({
    summary: 'Échange un code OAuth contre des tokens (usage unique, 30s)',
  })
  @ApiResponse({ status: 200, description: 'Tokens retournés' })
  @ApiResponse({ status: 401, description: 'Code invalide ou expiré' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  exchange(@Body() dto: ExchangeCodeDto) {
    return this.queryBus.execute(new ExchangeOAuthCodeQuery(dto.code));
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Authentification via Google' })
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuthenticate(): void {}

  @ApiOperation({ summary: 'Callback Google OAuth' })
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleCallbackGuard)
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as OAuthRequestUser | undefined);
  }

  @ApiOperation({ summary: 'Authentification via Facebook' })
  @Public()
  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookAuthenticate(): void {}

  @ApiOperation({ summary: 'Callback Facebook OAuth' })
  @Public()
  @Get('facebook/callback')
  @UseGuards(FacebookCallbackGuard)
  facebookCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as OAuthRequestUser | undefined);
  }

  @ApiOperation({ summary: 'Authentification via LinkedIn' })
  @Public()
  @Get('linkedin')
  @UseGuards(LinkedinAuthGuard)
  linkedinAuthenticate(): void {}

  @ApiOperation({ summary: 'Callback LinkedIn OAuth' })
  @Public()
  @Get('linkedin/callback')
  @UseGuards(LinkedinCallbackGuard)
  linkedinCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as OAuthRequestUser | undefined);
  }

  /**
   * Un échec OAuth ne peut pas se répondre en JSON : l'utilisateur est dans son
   * navigateur, sur une URL de callback. On le renvoie donc toujours vers le
   * front, avec un code d'échange ou un message d'erreur.
   */
  private async redirectWithCode(
    res: Response,
    user: OAuthRequestUser | undefined,
  ) {
    const target =
      user?._redirectTo === 'admin' ? this.urls.admin : this.urls.frontend;

    if (!user) {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Connexion annulée ou refusée')}`,
      );
    }

    try {
      const { code, isNewUser }: SocialAuthResult =
        await this.commandBus.execute(new SocialAuthCommand(user));

      return res.redirect(
        `${target}/auth/oauth-callback?code=${code}&isNewUser=${isNewUser ? '1' : '0'}`,
      );
    } catch {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Authentification échouée')}`,
      );
    }
  }
}
