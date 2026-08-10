import { Injectable } from '@nestjs/common';
import { Strategy } from 'passport-facebook';
import { PassportStrategy } from '@nestjs/passport';
import { Social } from 'src/iam/domains/models/social-provider';
import { SocialProfile } from 'src/iam/domains/models/social-profile';
import { CookieOAuthStateStore } from '../cookie-oauth-state.store';

@Injectable()
export class FacebookAuthStrategy extends PassportStrategy(
  Strategy,
  Social.FACEBOOK,
) {
  constructor() {
    // `store` (state store OAuth custom, protection CSRF) est supporté au runtime
    // par passport-oauth2 mais absent des typings de passport-facebook.
    super({
      clientID: process.env.FACEBOOK_APP_ID || '',
      clientSecret: process.env.FACEBOOK_APP_SECRET || '',
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || '',
      scope: ['email', 'public_profile'],
      graphAPIVersion: 'v20.0',
      profileFields: ['id', 'emails', 'first_name', 'last_name', 'photos'],
      store: new CookieOAuthStateStore('facebook'),
    } as any);
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    return {
      email: profile.emails?.[0]?.value ?? '',
      firstname: profile.name?.givenName ?? '',
      lastname: profile.name?.familyName ?? '',
      picture: profile.photos?.[0]?.value,
      socialId: profile.id,
    } as SocialProfile;
  }
}
