import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { SocialInterface } from '../../infrastructures/interfaces/social.interface';
import { UserFactory } from 'src/users/domains/factories/user.factory';

@Injectable()
export class SocialAuthUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly userFactory: UserFactory,
  ) {}

  async authenticate(social: SocialInterface): Promise<{
    accessToken: string;
    refreshToken: string;
    isNewUser: boolean;
  }> {
    try {
      const existing = await this.usersRepository.findOneBySocialId(
        social.socialId,
      );

      if (existing) {
        // Auto-verify email for existing social users (provider already verified it)
        if (!existing.userEmail.isVerified) {
          existing.userEmail.verify();
          await this.usersRepository.update(existing);
        }
        const tokens = await this.tokenService.generateTokens({
          email: existing.userEmail.email,
          sub: existing.userId,
          role: existing.role,
          refreshTokenId: null,
        });
        return { ...tokens, isNewUser: false };
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
        email: savedUser.userEmail.email,
        sub: savedUser.userId,
        role: savedUser.role,
        refreshTokenId: null,
      });
      return { ...tokens, isNewUser: true };
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException('Email already in use');
      }

      throw new InternalServerErrorException('Authentification échouée');
    }
  }
}
