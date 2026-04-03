import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from '../domain/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from '../domain/ports/cahe-manager.service';
import { MailerService } from '@nestjs-modules/mailer';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class VerifyEmailService {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
    private readonly mailerService: MailerService,
  ) {}

  async sendVerificationEmail(
    emailVerificationDto: EmailVerificationDto,
  ): Promise<void> {
    const user = await this.usersRepository.findByEmail(
      emailVerificationDto.email,
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.userEmail.isVerified) {
      throw new BadRequestException('This email is already verified');
    }

    const tokenId = randomUUID();

    const token = await this.tokenService.generateEmailToken({
      sub: user.userId,
      email: user.userEmail.email,
      emailTokenId: tokenId,
    });

    await this.cacheManagerService.insertEmailTokenId(
      user.userEmail.email,
      tokenId,
    );

    const confirmEmailUrl = `http://localhost:3000/email/verify?token=${token}`;

    await this.mailerService.sendMail({
      to: emailVerificationDto.email,
      subject: 'Confirmez votre adresse email',
      text: `Cliquer ici pour confirmer: ${confirmEmailUrl}`,
    });
  }

  async confirmEmail(token: string): Promise<string> {
    try {
      const emailTokenPayload = await this.tokenService.verifyEmailToken(token);

      const isValidToken = await this.cacheManagerService.validateEmailToken(
        emailTokenPayload.email,
        emailTokenPayload.emailTokenId,
      );

      if (isValidToken) {
        await this.cacheManagerService.invalidateEmailTokenId(
          emailTokenPayload.email,
        );
      } else {
        throw new BadRequestException('Token invalide ou expiré');
      }

      const user = await this.usersRepository.findByEmail(
        emailTokenPayload.email,
      );

      if (!user) {
        throw new BadRequestException('Token invalide ou expiré');
      }

      user?.userEmail.verify();

      await this.usersRepository.update(user);

      return user.userEmail.email;
    } catch {
      throw new BadRequestException('Token invalide ou expiré');
    }
  }
}
