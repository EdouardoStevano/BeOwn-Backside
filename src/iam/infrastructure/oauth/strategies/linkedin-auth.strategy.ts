import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import axios from 'axios';
import { Social } from 'src/iam/application/dto/social-provider';
import { SocialProfile } from 'src/iam/application/dto/social-profile';
import { CookieOAuthStateStore } from '../cookie-oauth-state.store';

// LinkedIn deprecated r_liteprofile / r_emailaddress (old API /v2/me).
// New apps must use OpenID Connect scopes: openid profile email
// and fetch identity from https://api.linkedin.com/v2/userinfo

@Injectable()
export class LinkedinStrategy extends PassportStrategy(
  Strategy,
  Social.LINKEDIN,
) {
  constructor() {
    // `store` (state store OAuth custom, protection CSRF) est supporté au runtime
    // par passport-oauth2 mais absent des typings exposés ici.
    super({
      authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientID: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      callbackURL: process.env.LINKEDIN_CALLBACK_URL || '',
      scope: ['openid', 'profile', 'email'],
      // Skip passport-oauth2's built-in profile fetch — we do it ourselves
      // with the new OIDC userinfo endpoint
      skipUserProfile: true,
      store: new CookieOAuthStateStore('linkedin'),
    } as any);
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    _profile: unknown,
  ): Promise<SocialProfile> {
    try {
      const { data } = await axios.get<{
        sub: string;
        email?: string;
        email_verified?: boolean;
        given_name?: string;
        family_name?: string;
        picture?: string;
      }>('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 5000,
      });

      if (!data.email) {
        throw new Error('Aucune adresse email associée à ce compte LinkedIn.');
      }
      if (data.email_verified === false) {
        throw new Error('Adresse email LinkedIn non vérifiée.');
      }

      return {
        socialId: data.sub,
        email: data.email,
        firstname: data.given_name ?? '',
        lastname: data.family_name ?? '',
        picture: data.picture,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('LinkedIn') || err.message.includes('email'))
      ) {
        throw err;
      }
      throw new Error('Impossible de récupérer le profil LinkedIn');
    }
  }
}
