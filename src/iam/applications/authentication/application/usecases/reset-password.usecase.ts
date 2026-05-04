import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { ResetPasswordDto } from '../../../../presenters/http/dto/password.dto';
import { HASHING_SERVICE, type HashingService } from 'src/common/hashing/hashing.service';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<void> {
    let payload: EmailTokenPayload;
    try {
      payload = await this.tokenService.verifyEmailToken(dto.token);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    const hashedPassword = await this.hashingService.hash(dto.newPassword);
    user.password = hashedPassword;
    await this.userRepository.update(user);
  }
}
