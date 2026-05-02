import { Inject, Injectable } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  TOKEN_SERVICE,
  TokenPayload,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import { SignInDto } from '../../presenters/http/dto/sign-in.dto';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';
import { EmailNotVerifiedError } from 'src/users/domain/errors/email-not-verified.error';

@Injectable()
export class SignInUsecase {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
  ) {}

  async signIn(signInDto: SignInDto) {
    const user = await this.usersRepository.findByEmail(signInDto.email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (!user.isEmailVerified()) {
      throw new EmailNotVerifiedError();
    }

    const isValidPassword = await this.hashingService.compare(
      signInDto.password,
      user.password!,
    );

    if (!isValidPassword) {
      throw new InvalidCredentialsError();
    }

    return this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
    } as TokenPayload);
  }
}