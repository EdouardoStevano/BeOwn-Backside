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
import { SignInUsecase } from '../../applications/authentication/application/usecases/sign-in.usecase';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokenUseCase } from '../../applications/authentication/application/usecases/refresh-token.usecase';
import { SocialAuthUseCase } from '../../applications/authentication/application/usecases/social-auth.usecase';
import { FacebookAuthGuard } from '../../applications/authentication/infrastructures/guards/facebook-auth.guard';
import { FacebookCallbackGuard } from '../../applications/authentication/infrastructures/guards/facebook-callback.guard';
import { GoogleAuthGuard } from '../../applications/authentication/infrastructures/guards/google-auth.guard';
import { GoogleCallbackGuard } from '../../applications/authentication/infrastructures/guards/google-callback.guard';
import { LinkedinAuthGuard } from '../../applications/authentication/infrastructures/guards/linkedin-auth.guard';
import { LinkedinCallbackGuard } from '../../applications/authentication/infrastructures/guards/linkedin-callback.guard';
import { ForgotPasswordUseCase } from '../../applications/authentication/application/usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from '../../applications/authentication/application/usecases/reset-password.usecase';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignUpDto,
} from './dto/password.dto';
import { RegisterUseCase } from 'src/users/applications/usecases/register.usecase';
import { Public } from 'src/common/auth/public.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly signInUsecase: SignInUsecase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly socialAuthUseCase: SocialAuthUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly registerUseCase: RegisterUseCase,
  ) {}

  @ApiOperation({ summary: 'Connexion avec email et mot de passe' })
  @ApiResponse({ status: 200, description: 'Tokens retournés avec succès' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() signInDto: SignInDto) {
    return this.signInUsecase.signIn(signInDto);
  }

  @ApiOperation({ summary: "Rafraîchir les tokens d'accès" })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens retournés' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.refreshTokenUseCase.refreshToken(refreshTokenDto);
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

  private async redirectWithTokens(res: Response, user: any) {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    if (!user) {
      return res.redirect(
        `${frontend}/auth/oauth-callback?error=${encodeURIComponent('Connexion annulée ou refusée')}`,
      );
    }
    try {
      const { accessToken, refreshToken, isNewUser } =
        await this.socialAuthUseCase.authenticate(user);
      return res.redirect(
        `${frontend}/auth/oauth-callback?accessToken=${accessToken}&refreshToken=${refreshToken}&isNewUser=${isNewUser ? '1' : '0'}`,
      );
    } catch (err) {
      return res.redirect(
        `${frontend}/auth/oauth-callback?error=${encodeURIComponent(err?.message ?? 'Authentification échouée')}`,
      );
    }
  }

  @ApiOperation({ summary: 'Inscription (sign-up)' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès' })
  @Public()
  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto) {
    const user = await this.registerUseCase.execute(dto);
    const { password: _p, ...safe } = user as any;
    return safe;
  }

  @ApiOperation({ summary: 'Mot de passe oublié' })
  @ApiResponse({ status: 204, description: 'Email de réinitialisation envoyé si le compte existe' })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.forgotPasswordUseCase.execute(dto);
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
