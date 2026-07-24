import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import {
  OTP_SERVICE,
  type OtpService,
  type SecretOtpPayload,
} from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { TOTPMethodEntity } from 'src/users/infrastructure/persistences/entities/totp-method.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';

const ENCRYPTION_PREFIX = 'enc:v1';

export class SetupTotpDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class VerifyTotpDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    example: '123456',
    description: "Code TOTP genere par l'application authenticator",
  })
  @IsString()
  otp: string;
}

@Injectable()
export class CreateTotpUseCase {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @InjectRepository(TOTPMethodEntity)
    private readonly totpRepo: Repository<TOTPMethodEntity>,
    private readonly configService: ConfigService,
  ) {}

  async setup(userId: number, email: string): Promise<SecretOtpPayload> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const payload = this.otpService.generateSecretTotp(email);
    const method = this.totpRepo.create({
      isActive: false,
      secretKeyOtp: this.encryptSecret(payload.secret),
      user: { userId } as UserEntity,
    });

    await this.totpRepo.save(method);
    return payload;
  }

  async verify(userId: number, dto: VerifyTotpDto): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const methods = await this.totpRepo
      .createQueryBuilder('method')
      .addSelect('method.secretKeyOtp')
      .leftJoin('method.user', 'user')
      .where('user.userId = :userId', { userId })
      .orderBy('method.TFAMethodId', 'DESC')
      .getMany();

    if (methods.length === 0) {
      throw new NotFoundException('TOTP non configure');
    }

    let validMethod: TOTPMethodEntity | null = null;
    for (const method of methods) {
      const secret = this.decryptSecret(method.secretKeyOtp);
      if (this.otpService.verifyTotp(dto.otp, secret)) {
        validMethod = method;
        break;
      }
    }

    if (!validMethod) {
      throw new BadRequestException('Code TOTP invalide');
    }

    if (!validMethod.isActive) {
      await this.totpRepo
        .createQueryBuilder()
        .update(TOTPMethodEntity)
        .set({ isActive: false })
        .where('user_id = :userId', { userId })
        .execute();

      validMethod.isActive = true;
      await this.totpRepo.save(validMethod);
    }

    return true;
  }

  private getEncryptionKey(): Buffer {
    const secret =
      this.configService.get<string>('TFA_SECRET_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        'TFA_SECRET_ENCRYPTION_KEY or JWT_SECRET must be configured',
      );
    }

    if (/^[a-f0-9]{64}$/i.test(secret)) {
      return Buffer.from(secret, 'hex');
    }

    return createHash('sha256').update(secret).digest();
  }

  private encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      ENCRYPTION_PREFIX,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private decryptSecret(value: string): string {
    if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) return value;

    const [, , ivRaw, tagRaw, encryptedRaw] = value.split(':');
    if (!ivRaw || !tagRaw || !encryptedRaw) {
      throw new BadRequestException('Secret TOTP invalide');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(ivRaw, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
