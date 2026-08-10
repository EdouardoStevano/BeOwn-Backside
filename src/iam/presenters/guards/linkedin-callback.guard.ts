import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Social } from 'src/iam/domains/models/social-provider';
import {
  readOAuthRedirectCookie,
  type AuthenticatedSocialUser,
} from './oauth-redirect-cookie';

@Injectable()
export class LinkedinCallbackGuard extends AuthGuard(Social.LINKEDIN) {
  handleRequest(
    err: unknown,
    user: AuthenticatedSocialUser | false,
    _info: unknown,
    context: ExecutionContext,
    // `IAuthGuard.handleRequest` est déclaré générique (`<TUser = any>`) côté
    // Passport : seul un retour `any` satisfait sa contrainte. Les paramètres,
    // eux, restent typés — c'est là que se trouvait le vrai `any` gênant.
  ): any {
    if (err || !user) return null;
    const req = context.switchToHttp().getRequest<Request>();
    if (readOAuthRedirectCookie(req) === 'admin') user._redirectTo = 'admin';
    return user;
  }
}
