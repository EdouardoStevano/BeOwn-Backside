import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from 'src/iam/domains/models/social-provider';
import type { AuthenticatedSocialUser } from './oauth-redirect-cookie';

@Injectable()
export class FacebookCallbackGuard extends AuthGuard(Social.FACEBOOK) {
  // Retour `any` : contrainte de `IAuthGuard.handleRequest<TUser = any>`.
  handleRequest(err: unknown, user: AuthenticatedSocialUser | false): any {
    if (err || !user) return null;
    return user;
  }
}
