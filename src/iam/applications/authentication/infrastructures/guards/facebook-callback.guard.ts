import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from '../constant/social';

@Injectable()
export class FacebookCallbackGuard extends AuthGuard(Social.FACEBOOK) {
  handleRequest(err: any, user: any) {
    if (err || !user) return null;
    return user;
  }
}
