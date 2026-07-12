import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import { ResetPasswordCommand } from './reset-password.command';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler
  implements ICommandHandler<ResetPasswordCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    let payload: EmailTokenPayload;
    try {
      payload = await this.tokenService.verifyEmailToken(command.token);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    user.password = await this.hashingService.hash(command.newPassword);
    await this.userRepository.update(user);
  }
}
