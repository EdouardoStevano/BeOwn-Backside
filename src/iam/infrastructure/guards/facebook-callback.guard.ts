import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SocialProvider } from 'src/iam/domain/enums/social-provider.enum';

@Injectable()
export class FacebookCallbackGuard extends AuthGuard(SocialProvider.FACEBOOK) {
  handleRequest(err: any, user: any) {
    if (err || !user) return null;
    return user;
  }
}
