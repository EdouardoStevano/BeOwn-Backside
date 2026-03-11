import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { Social } from '../constant/social';
import { SocialInterface } from '../interface/social.interface';

@Injectable()
export class FacebookStrategy extends PassportStrategy(
  Strategy,
  Social.FACEBOOK,
) {
  constructor() {
    super({
      clientID: process.env.FACEBOOK_APP_ID || '',
      clientSecret: process.env.FACEBOOK_APP_SECRET || '',
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || '',
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'emails', 'name', 'photos'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    return {
      email: profile.emails[0].value,
      firstname: profile.name.givenName,
      lastname: profile.name.familyName,
      picture: profile.photos[0]?.value,
      socialId: profile.id,
      accessToken,
    } as SocialInterface;
  }
}
