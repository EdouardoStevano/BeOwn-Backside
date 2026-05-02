import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domain/ports/cahe-manager.service';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { UserNotFoundError } from 'src/users/domain/errors/user-not-found.error';

@Injectable()
export class ConfirmEmailUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
  ) {}

  async execute(token: string): Promise<string> {
    let emailTokenPayload;
    try {
      emailTokenPayload = await this.tokenService.verifyEmailToken(token);
    } catch {
      throw new InvalidCredentialsError();
    }

    const isValid = await this.cacheManagerService.validateEmailToken(
      emailTokenPayload.email,
      emailTokenPayload.emailTokenId,
    );

    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    await this.cacheManagerService.invalidateEmailTokenId(emailTokenPayload.email);

    const user = await this.userRepository.findByEmail(emailTokenPayload.email);
    if (!user) {
      throw new UserNotFoundError();
    }

    user.verifyEmail();
    await this.userRepository.update(user);

    return user.userEmail.email;
  }
}
