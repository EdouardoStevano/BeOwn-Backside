import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SignInUsecase } from '../../application/usecases/sign-in.usecase';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokenUseCase } from '../../application/usecases/refresh-token.usecase';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly signInUsecase: SignInUsecase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
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
}
