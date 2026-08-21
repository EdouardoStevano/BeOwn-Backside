import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from 'src/iam/application/dto/social-provider';

@Injectable()
export class FacebookAuthGuard extends AuthGuard(Social.FACEBOOK) {}
