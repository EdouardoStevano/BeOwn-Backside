import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Social } from '../constant/social';

@Injectable()
export class GoogleCallbackGuard extends AuthGuard(Social.GOOGLE) {
  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) return null;
    const req = context.switchToHttp().getRequest<Request>();
    const state = req.query.state as string;
    if (state === 'admin') user._redirectTo = 'admin';
    return user;
  }
}
