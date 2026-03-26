import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { MailVerificationDto } from '../dto/email-verification.dto';
import { RefreshTokenIdsStorage } from '../refresh-token-ids.storage/refresh-token-ids.storage';
import { randomUUID } from 'crypto';

@Injectable()
export class MailVerificationService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly tokenIdsStorage: RefreshTokenIdsStorage,
  ) {}

  async sendVerificationEmail(
    mailVerificationDto: MailVerificationDto,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { email: mailVerificationDto.email },
    });

    const tokenId = randomUUID();

    if (!user) {
      throw new NotFoundException(
        `User with email: ${mailVerificationDto.email} not found`,
      );
    }

    const token = this.jwtService.sign(
      { sub: user.id, email: mailVerificationDto.email, tokenId },
      { expiresIn: '24h' },
    );

    await this.tokenIdsStorage.insert(user.id, tokenId);

    const confirmUrl = `http://localhost:3000/auth/mail/verify-email?token=${token}`;

    await this.mailerService.sendMail({
      to: mailVerificationDto.email,
      subject: 'Confirmez votre adresse email',
      text: `Cliquer ici pour confirmer : ${confirmUrl}`,
    });
  }

  async confirmMail(token: string): Promise<string> {
    try {
      const { sub, email, tokenId } = this.jwtService.verify(token);

      const isValidToken = await this.tokenIdsStorage.validate(sub, tokenId);

      if (isValidToken) {
        await this.tokenIdsStorage.invalidate(sub);
      } else {
        throw new BadRequestException('Token invalide ou expiré');
      }

      this.usersRepository.update({ email }, { isEmailVerify: true });
      return email;
    } catch {
      throw new BadRequestException('Token invalide ou expiré');
    }
  }
}
