import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Social } from '../constant/social';
import { SocialInterface } from '../interface/social.interface';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, Social.GOOGLE) {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const user: SocialInterface = {
      email: profile.emails[0].value,
      firstname: profile.name.givenName,
      lastname: profile.name.familyName,
      picture: profile.photos[0]?.value,
      socialId: profile.id,
      accessToken,
    };

    done(null, user);
  }
}
