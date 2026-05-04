import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import axios from 'axios';
import { Social } from '../../infrastructures/constant/social';
import { SocialInterface } from '../../infrastructures/interfaces/social.interface';

// LinkedIn deprecated r_liteprofile / r_emailaddress (old API /v2/me).
// New apps must use OpenID Connect scopes: openid profile email
// and fetch identity from https://api.linkedin.com/v2/userinfo

@Injectable()
export class LinkedinStrategy extends PassportStrategy(
  Strategy,
  Social.LINKEDIN,
) {
  constructor() {
    super({
      authorizationURL:
        'https://www.linkedin.com/oauth/v2/authorization',
      tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientID: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      callbackURL: process.env.LINKEDIN_CALLBACK_URL || '',
      scope: ['openid', 'profile', 'email'],
      // Skip passport-oauth2's built-in profile fetch — we do it ourselves
      // with the new OIDC userinfo endpoint
      skipUserProfile: true,
    });
  }

  async validate(accessToken: string, _refreshToken: string, _profile: unknown): Promise<SocialInterface> {
    const { data } = await axios.get<{
      sub: string;
      email?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    }>('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      socialId: data.sub,
      email: data.email ?? '',
      firstname: data.given_name ?? '',
      lastname: data.family_name ?? '',
      picture: data.picture,
    };
  }
}
