import { Injectable } from '@nestjs/common';
import { Strategy } from 'passport-facebook';
import { PassportStrategy } from '@nestjs/passport';
import { SocialProvider } from 'src/iam/domain/enums/social-provider.enum';
import { SocialProfile } from 'src/iam/domain/models/social-profile';

@Injectable()
export class FacebookAuthStrategy extends PassportStrategy(
  Strategy,
  SocialProvider.FACEBOOK,
) {
  constructor() {
    super({
      clientID: process.env.FACEBOOK_APP_ID || '',
      clientSecret: process.env.FACEBOOK_APP_SECRET || '',
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || '',
      scope: ['email', 'public_profile'],
      graphAPIVersion: 'v20.0',
      profileFields: ['id', 'emails', 'first_name', 'last_name', 'photos'],
    });
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
