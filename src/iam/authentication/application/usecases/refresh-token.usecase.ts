import { Inject, UnauthorizedException } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import { RefreshTokenDto } from '../../presenters/http/dto/refresh-token.dto';

export class RefreshTokenUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      return await this.tokenService.refreshTokens(
        refreshTokenDto.refreshToken,
      );
    } catch (err) {
      throw new UnauthorizedException();
    }
  }
}
