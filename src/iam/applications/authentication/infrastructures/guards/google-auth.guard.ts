import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Social } from '../constant/social';

@Injectable()
export class GoogleAuthGuard extends AuthGuard(Social.GOOGLE) {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const redirectTo = req.query.redirectTo === 'admin' ? 'admin' : 'frontend';
    return { state: redirectTo };
  }
}
