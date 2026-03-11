import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-linkedin-oauth2';
import { Social } from '../constant/social';
import { SocialInterface } from '../interface/social.interface';

@Injectable()
export class LinkedinStrategy extends PassportStrategy(
  Strategy,
  Social.LINKEDIN,
) {
  constructor() {
    super({
      clientID: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      callbackURL: process.env.LINKEDIN_CALLBACK_IRL || '',
      scope: ['r_emailaddress', 'r_liteprofile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: any) {
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
