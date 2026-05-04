import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from '../constant/social';

@Injectable()
export class FacebookAuthGuard extends AuthGuard(Social.FACEBOOK) {}
