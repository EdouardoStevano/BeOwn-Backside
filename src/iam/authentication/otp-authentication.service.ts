import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { generateSecret, generateURI, verify } from 'otplib';

@Injectable()
export class OtpAuthenticationService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async generateSecret(email: string) {
    const secret = generateSecret();
    const appName = this.configService.getOrThrow('TFA_APP_NAME');
    const uri = generateURI({ issuer: appName, label: email, secret });

    return {
      uri,
      secret,
    };
  }

  verifyCode(code: string, secret: string) {
    return verify({ token: code, secret });
  }

  async enableTfaForUser(email: string, secret: string) {
    const { id } = await this.userRepository.findOneOrFail({
      where: { email },
      select: { id: true },
    });

    await this.userRepository.update(
      { id },
      { tfaSecret: secret, isTfaEnabled: true },
    );
  }
}
