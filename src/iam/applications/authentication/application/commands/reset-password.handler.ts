import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  type TokenService,
  PasswordResetTokenPayload,
} from 'src/iam/domains/ports/token.service';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cahe-manager.service';
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
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    let payload: PasswordResetTokenPayload;
    try {
      // Rejette aussi un token expiré (TTL JWT) ou d'un autre type.
      payload = await this.tokenService.verifyPasswordResetToken(command.token);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    const isValid = await this.cacheManagerService.validatePasswordResetToken(
      payload.email,
      payload.resetTokenId,
    );
    if (!isValid) {
      // Lien déjà consommé, révoqué par une demande plus récente, ou expiré côté cache.
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    // Consommé avant la mise à jour : deux requêtes concurrentes avec le même
    // lien ne peuvent pas passer toutes les deux.
    await this.cacheManagerService.invalidatePasswordResetTokenId(payload.email);

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    user.password = await this.hashingService.hash(command.newPassword);
    await this.userRepository.update(user);

    // Le mot de passe a changé : les sessions ouvertes ailleurs ne doivent pas survivre.
    await this.cacheManagerService.invalidateRefreshTokenId(payload.email);
  }
}
