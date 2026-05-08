import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Social } from '../../infrastructures/constant/social';
import { SocialInterface } from '../../infrastructures/interfaces/social.interface';

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
    const emailEntry = profile.emails?.[0];
    if (!emailEntry?.value) {
      return done(new Error('Aucune adresse email associée à ce compte Google.'));
    }
    if (emailEntry.verified === false) {
      return done(new Error('Adresse email Google non vérifiée.'));
    }

    const user: SocialInterface = {
      email: emailEntry.value,
      firstname: profile.name?.givenName ?? profile.displayName ?? '',
      lastname: profile.name?.familyName ?? '',
      picture: profile.photos?.[0]?.value,
      socialId: profile.id,
    };

    done(null, user);
  }
}
