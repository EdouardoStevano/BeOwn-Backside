import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SignInUsecase } from '../../application/usecases/sign-in.usecase';
import { SignInDto } from './dto/sign-in.dto';

@Controller('auth')
export class AuthenticationController {
  constructor(private readonly signInUsecase: SignInUsecase) {}

  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() signInDto: SignInDto) {
    return this.signInUsecase.signIn(signInDto);
  }
}
