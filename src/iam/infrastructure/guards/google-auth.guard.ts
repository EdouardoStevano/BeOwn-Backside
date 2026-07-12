import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { SocialProvider } from 'src/iam/domain/enums/social-provider.enum';

@Injectable()
export class GoogleAuthGuard extends AuthGuard(SocialProvider.GOOGLE) {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const redirectTo = req.query.redirectTo === 'admin' ? 'admin' : 'frontend';
    return { state: redirectTo };
  }
}
