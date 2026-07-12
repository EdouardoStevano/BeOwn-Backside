import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TOKEN_SERVICE,
  AuthTokens,
  type TokenService,
} from 'src/iam/domains/ports/token.service';
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
      throw new UnauthorizedException();
    }
  }
}
