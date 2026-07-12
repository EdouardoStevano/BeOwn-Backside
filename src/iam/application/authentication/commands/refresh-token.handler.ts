import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  type TokenService,
  AuthTokens,
} from 'src/iam/domain/ports/token.service';
import { InvalidRefreshTokenError } from 'src/iam/domain/errors/iam.errors';
import { RefreshTokenCommand } from './refresh-token.command';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    try {
      return await this.tokenService.refreshTokens(command.refreshToken);
    } catch {
      // Signature invalide, token expiré, ou refresh déjà consommé : le client
      // n'a pas à savoir lequel des trois.
      throw new InvalidRefreshTokenError();
    }
  }
}
