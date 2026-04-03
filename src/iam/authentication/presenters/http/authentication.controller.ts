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
import { SignInUsecase } from '../../application/usecases/sign-in.usecase';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokenUseCase } from '../../application/usecases/refresh-token.usecase';
import { SocialAuthUseCase } from '../../application/usecases/social-auth.usecase';
import { FacebookAuthGuard } from '../../infrastructures/guards/facebook-auth.guard';
import { GoogleAuthGuard } from '../../infrastructures/guards/google-auth.guard';
import { LinkedinAuthGuard } from '../../infrastructures/guards/linkedin-auth.guard';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly signInUsecase: SignInUsecase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly socialAuthUseCase: SocialAuthUseCase,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() signInDto: SignInDto) {
    return this.signInUsecase.signIn(signInDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.refreshTokenUseCase.refreshToken(refreshTokenDto);
  }

  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookAuthenticate() {}

  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  facebookCallback(@Req() req) {
    const user = req.user;
    return this.socialAuthUseCase.authenticate(user);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuthenticate() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req) {
    const user = req.user;
    console.log(user);
    return this.socialAuthUseCase.authenticate(user);
  }

  @Get('linkedin')
  @UseGuards(LinkedinAuthGuard)
  linkedinAuthenticate() {}

  @Get('linkedin/callback')
  @UseGuards(LinkedinAuthGuard)
  linkedinCallback(@Req() req) {
    const user = req.user;
    return this.socialAuthUseCase.authenticate(user);
  }
}
