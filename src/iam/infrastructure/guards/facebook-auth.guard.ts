import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SocialProvider } from 'src/iam/domain/enums/social-provider.enum';

@Injectable()
export class FacebookAuthGuard extends AuthGuard(SocialProvider.FACEBOOK) {}
