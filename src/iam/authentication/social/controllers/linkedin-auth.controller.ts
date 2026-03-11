import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SocialAuthService } from '../social-authentication.service';
import { LinkedinAuthGuard } from '../guards/linkedin.guards';

@Controller('auth/linkedin')
export class LinkedinAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Get()
  @UseGuards(LinkedinAuthGuard)
  authenticate() {}

  @Get('callback')
  @UseGuards(LinkedinAuthGuard)
  callBack(@Req() req) {
    const user = req.user;
    return this.socialAuthService.authenticate(user);
  }
}
