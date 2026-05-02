import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
  EmailTokenPayload,
} from 'src/iam/domain/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { ForgotPasswordDto } from '../../presenters/http/dto/password.dto';
import { EMAIL_SERVICE, type EmailService } from 'src/common/email/email.service';

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  async execute(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('Email non trouvé');
    }

    const payload: EmailTokenPayload = {
      sub: user.userId,
      email: user.userEmail.email,
      emailTokenId: Math.random().toString(36).substring(7),
    };

    const token = await this.tokenService.generateEmailToken(payload);

    if (this.emailService.sendPasswordResetEmail) {
      await this.emailService.sendPasswordResetEmail(dto.email, token);
    }
  }
}
