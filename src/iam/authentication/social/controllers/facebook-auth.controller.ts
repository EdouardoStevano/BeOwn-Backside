import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SocialAuthService } from '../social-authentication.service';
import { FacebookAuthGuard } from '../guards/facebook.guards';
import { Auth } from '../../decorators/auth.decorator';
import { AuthType } from '../../enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('auth/facebook')
export class FacebookAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Get()
  @UseGuards(FacebookAuthGuard)
  authenticate() {}

  @Get('callback')
  @UseGuards(FacebookAuthGuard)
  callBack(@Req() req) {
    const user = req.user;
    return this.socialAuthService.authenticate(user);
  }
}
