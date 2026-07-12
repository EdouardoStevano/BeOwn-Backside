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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { SignInCommand } from '../../applications/authentication/application/commands/sign-in.command';
import { RefreshTokenCommand } from '../../applications/authentication/application/commands/refresh-token.command';
import { SocialAuthCommand } from '../../applications/authentication/application/commands/social-auth.command';
import { ForgotPasswordCommand } from '../../applications/authentication/application/commands/forgot-password.command';
import { ResetPasswordCommand } from '../../applications/authentication/application/commands/reset-password.command';
import { SignInDto } from './dto/sign-in.dto';
import { ExchangeCodeDto, RefreshTokenDto } from './dto/refresh-token.dto';
import { FacebookAuthGuard } from '../../applications/authentication/infrastructures/guards/facebook-auth.guard';
import { FacebookCallbackGuard } from '../../applications/authentication/infrastructures/guards/facebook-callback.guard';
import { GoogleAuthGuard } from '../../applications/authentication/infrastructures/guards/google-auth.guard';
import { GoogleCallbackGuard } from '../../applications/authentication/infrastructures/guards/google-callback.guard';
import { LinkedinAuthGuard } from '../../applications/authentication/infrastructures/guards/linkedin-auth.guard';
import { LinkedinCallbackGuard } from '../../applications/authentication/infrastructures/guards/linkedin-callback.guard';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignUpDto,
} from './dto/password.dto';
import { RegisterCommand } from 'src/users/applications/commands/register.command';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { Public } from 'src/common/auth/public.decorator';
import { Throttle } from '@nestjs/throttler';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cahe-manager.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly recaptchaService: RecaptchaService,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
  ) {}

  @ApiOperation({ summary: 'Connexion avec email et mot de passe' })
  @ApiResponse({ status: 200, description: 'Tokens retournés avec succès' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({
    status: 429,
    description: 'Trop de tentatives — réessayez dans 15 min',
  })
  @Throttle({ auth: { ttl: 900_000, limit: 500 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() signInDto: SignInDto) {
    return this.commandBus.execute(
      new SignInCommand(signInDto.email, signInDto.password),
    );
  }

  @ApiOperation({ summary: "Rafraîchir les tokens d'accès" })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens retournés' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  @Throttle({ medium: { ttl: 60_000, limit: 500 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.commandBus.execute(
      new RefreshTokenCommand(refreshTokenDto.refreshToken),
    );
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
  async facebookCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithTokens(res, req.user);
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
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithTokens(res, req.user);
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
  async linkedinCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithTokens(res, req.user);
  }

  @ApiOperation({
    summary: 'Échange un code OAuth contre des tokens (usage unique, 30s)',
  })
  @ApiResponse({ status: 200, description: 'Tokens retournés' })
  @ApiResponse({ status: 401, description: 'Code invalide ou expiré' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  async exchange(@Body() dto: ExchangeCodeDto) {
    const tokens = await this.cacheManagerService.getAndDeleteOAuthCode(
      dto.code,
    );
    if (!tokens) throw new UnauthorizedException('Code invalide ou expiré');
    return tokens;
  }

  private async redirectWithTokens(res: Response, user: any) {
    const isAdmin = user?._redirectTo === 'admin';
    const target = isAdmin
      ? (process.env.ADMIN_URL ?? 'http://localhost:5174')
      : (process.env.FRONTEND_URL ?? 'http://localhost:5173');

    if (!user) {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Connexion annulée ou refusée')}`,
      );
    }
    try {
      const { accessToken, refreshToken, isNewUser } =
        await this.commandBus.execute(new SocialAuthCommand(user));
      const code = randomUUID();
      await this.cacheManagerService.insertOAuthCode(code, {
        accessToken,
        refreshToken,
      });
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
  @ApiResponse({ status: 201, description: 'Compte créé avec succès' })
  @Throttle({ auth: { ttl: 900_000, limit: 200 } })
  @Public()
  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto) {
    await this.recaptchaService.verify(dto.captchaToken);
    const user = await this.commandBus.execute(
      new RegisterCommand(
        dto.firstname,
        dto.lastname ?? null,
        dto.email,
        dto.password,
      ),
    );
    const { password: _p, ...safe } = user as any;
    return safe;
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
}
