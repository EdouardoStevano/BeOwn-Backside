import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';
import {
  OTP_SERVICE,
  type OtpService,
  type SecretOtpPayload,
} from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';

export class SetupTotpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class VerifyTotpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: "Code TOTP généré par l'application authenticator",
  })
  @IsString()
  otp: string;

  @ApiProperty({
    example: 'JBSWY3DPEHPK3PXP',
    description: 'Secret TOTP (fourni lors du setup)',
  })
  @IsString()
  secret: string;
}

@Injectable()
export class CreateTotpUseCase {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async setup(dto: SetupTotpDto): Promise<SecretOtpPayload> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    return this.otpService.generateSecretTotp(dto.email);
  }

  async verify(dto: VerifyTotpDto): Promise<boolean> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const valid = this.otpService.verifyTotp(dto.otp, dto.secret);
    if (!valid) throw new BadRequestException('Code TOTP invalide');
    return true;
  }
}
