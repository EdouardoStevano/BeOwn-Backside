import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Social } from '../constant/social';
import { readOAuthRedirectCookie } from './oauth-redirect-cookie';

@Injectable()
export class LinkedinCallbackGuard extends AuthGuard(Social.LINKEDIN) {
  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) return null;
    const req = context.switchToHttp().getRequest<Request>();
    if (readOAuthRedirectCookie(req) === 'admin') user._redirectTo = 'admin';
    return user;
  }
}
