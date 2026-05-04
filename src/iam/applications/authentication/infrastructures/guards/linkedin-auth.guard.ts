import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Social } from '../constant/social';

@Injectable()
export class LinkedinAuthGuard extends AuthGuard(Social.LINKEDIN) {}
