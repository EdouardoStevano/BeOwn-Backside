import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from '../constant/social';

@Injectable()
export class GoogleAuthGuard extends AuthGuard(Social.GOOGLE) {}
