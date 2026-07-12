import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  TOKEN_SERVICE,
  AuthTokens,
  TokenPayload,
  type TokenService,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { SignInCommand } from './sign-in.command';

@CommandHandler(SignInCommand)
export class SignInHandler implements ICommandHandler<SignInCommand> {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
  ) {}

  async execute(command: SignInCommand): Promise<AuthTokens> {
    const user = await this.usersRepository.findByEmail(command.email);

    if (!user) {
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect');
    }

    if (!user.userEmail.isVerified) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Veuillez vérifier votre adresse email avant de vous connecter.',
      });
    }

    const isValidPassword = await this.hashingService.compare(
      command.password,
      user.password!,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect');
    }

    const tokenPayload = await this.tokenService.generateTokens({
      sub: user.userId,
      email: user.userEmail.email,
      role: user.role,
    } as TokenPayload);

    return { ...tokenPayload };
  }
}
