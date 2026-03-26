import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SocialAuthService } from '../social-authentication.service';
import { GoogleAuthGuard } from '../guards/google.guards';
import { Auth } from '../../decorators/auth.decorator';
import { AuthType } from '../../enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Get()
  @UseGuards(GoogleAuthGuard)
  authenticate() {}

  @Get('callback')
  @UseGuards(GoogleAuthGuard)
  callBack(@Req() req) {
    const user = req.user;
    return this.socialAuthService.authenticate(user);
  }
}
