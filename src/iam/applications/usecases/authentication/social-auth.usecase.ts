import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthSession,
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domains/ports/token.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { SocialProfile } from 'src/iam/domains/models/social-profile';
import { UserFactory } from 'src/iam/domains/factories/user.factory';
import {
  EmailAlreadyRegisteredError,
  SocialAuthFailedError,
} from 'src/iam/domains/errors';

@Injectable()
export class SocialAuthUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly userFactory: UserFactory,
  ) {}

  async authenticate(
    social: SocialProfile,
  ): Promise<AuthSession & { isNewUser: boolean }> {
    try {
      const existing = await this.usersRepository.findOneBySocialId(
        social.socialId,
      );

      if (existing) {
        // Auto-verify email for existing social users (provider already verified it)
        if (!existing.isEmailVerified()) {
          existing.markEmailAsVerified();
          await this.usersRepository.update(existing);
        }
        const tokens = await this.tokenService.generateTokens({
          email: existing.email,
          sub: existing.userId,
          role: existing.role,
          refreshTokenId: null,
        });
        return { ...tokens, user: existing.toJSON(), isNewUser: false };
      }

      const newUser = await this.userFactory.create({
        password: null,
        firstname: social.firstname,
        lastname: social.lastname ?? null,
        email: social.email,
        socialId: social.socialId,
        emailVerified: true,
      });

      const savedUser = await this.usersRepository.save(newUser);
      const tokens = await this.tokenService.generateTokens({
        email: savedUser.email,
        sub: savedUser.userId,
        role: savedUser.role,
        refreshTokenId: null,
      });
      return { ...tokens, user: savedUser.toJSON(), isNewUser: true };
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new EmailAlreadyRegisteredError('Email already in use');
      }

      throw new SocialAuthFailedError();
    }
  }
}
