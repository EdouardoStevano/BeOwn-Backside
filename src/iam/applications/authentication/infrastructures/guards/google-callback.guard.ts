import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from '../constant/social';

@Injectable()
export class GoogleCallbackGuard extends AuthGuard(Social.GOOGLE) {
  handleRequest(err: any, user: any) {
    // Never throw — return null so the controller redirects to frontend error page
    if (err || !user) return null;
    return user;
  }
}
