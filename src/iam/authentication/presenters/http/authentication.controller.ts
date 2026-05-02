import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SignInUsecase } from '../../application/usecases/sign-in.usecase';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokenUseCase } from '../../application/usecases/refresh-token.usecase';
import { SocialAuthUseCase } from '../../application/usecases/social-auth.usecase';
import { FacebookAuthGuard } from '../../infrastructures/guards/facebook-auth.guard';
import { GoogleAuthGuard } from '../../infrastructures/guards/google-auth.guard';
import { LinkedinAuthGuard } from '../../infrastructures/guards/linkedin-auth.guard';
import { ForgotPasswordUseCase } from '../../application/usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from '../../application/usecases/reset-password.usecase';
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
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() signInDto: SignInDto) {
    return this.signInUsecase.signIn(signInDto);
  }

  @ApiOperation({ summary: "Rafraîchir les tokens d'accès" })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens retournés' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.refreshTokenUseCase.refreshToken(refreshTokenDto);
  }

  @ApiOperation({ summary: 'Authentification via Facebook' })
  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookAuthenticate() {}

  @ApiOperation({ summary: 'Callback Facebook OAuth' })
  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  facebookCallback(@Req() req) {
    const user = req.user;
    return this.socialAuthUseCase.authenticate(user);
  }

  @ApiOperation({ summary: 'Authentification via Google' })
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuthenticate() {}

  @ApiOperation({ summary: 'Callback Google OAuth' })
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req) {
    const user = req.user;
    return this.socialAuthUseCase.authenticate(user);
  }

  @ApiOperation({ summary: 'Authentification via LinkedIn' })
  @Get('linkedin')
  @UseGuards(LinkedinAuthGuard)
  linkedinAuthenticate() {}

  @ApiOperation({ summary: 'Callback LinkedIn OAuth' })
  @Get('linkedin/callback')
  @UseGuards(LinkedinAuthGuard)
  linkedinCallback(@Req() req) {
    const user = req.user;
    return this.socialAuthUseCase.authenticate(user);
  }

  @ApiOperation({ summary: 'Inscription (sign-up)' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès' })
  @Public()
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.registerUseCase.execute(dto);
  }

  @ApiOperation({ summary: 'Mot de passe oublié' })
  @ApiResponse({ status: 200, description: 'Email de réinitialisation envoyé' })
  @Public()
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
