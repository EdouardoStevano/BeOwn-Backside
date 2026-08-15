import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Social } from 'src/iam/applications/models/social-provider';
import { setOAuthRedirectCookie } from './oauth-redirect-cookie';

@Injectable()
export class GoogleAuthGuard extends AuthGuard(Social.GOOGLE) {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const redirectTo = req.query.redirectTo === 'admin' ? 'admin' : 'frontend';
    // Cible dans un cookie dédié — surtout PAS dans `state` (réservé au CSRF du
    // CookieOAuthStateStore ; une string dans `state` casse la pose du cookie).
    setOAuthRedirectCookie(req, redirectTo);
    return {};
  }
}
