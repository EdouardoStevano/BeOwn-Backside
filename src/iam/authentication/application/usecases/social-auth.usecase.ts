import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
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

  async authenticate(social: SocialInterface) {
    try {
      const user = await this.usersRepository.findOneBySocialId(
        social.socialId,
      );

      if (user) {
        console.log('executed');
        return this.tokenService.generateTokens({
          email: user.userEmail.email,
          sub: user.userId,
          refreshTokenId: null,
        });
      }

      const newUser = await this.userFactory.create({
        password: null,
        firstname: social.firstname,
        lastname: social.lastname ?? null,
        email: social.email,
        socialId: social.socialId,
      });

      const savedUser = await this.usersRepository.save(newUser);

      return this.tokenService.generateTokens({
        email: savedUser.userEmail.email,
        sub: savedUser.userId,
        refreshTokenId: null,
      });
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException('Email already in use');
      }

      throw new InternalServerErrorException(err.message);
    }
  }
}
