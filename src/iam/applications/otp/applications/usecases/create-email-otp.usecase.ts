import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { MailerService } from '@nestjs-modules/mailer';

export class SendEmailOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  otp: string;
}

@Injectable()
export class CreateEmailOtpUseCase {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly mailerService: MailerService,
  ) {}

  async send(dto: SendEmailOtpDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const key = `otp:email:${dto.email}`;
    const hasActive = await this.otpService.hasActiveOtp(key);
    if (hasActive) {
      throw new BadRequestException(
        'Un OTP est déjà actif, veuillez patienter',
      );
    }

    const otp = await this.otpService.generateOtp(key);

    await this.mailerService.sendMail({
      to: dto.email,
      subject: 'Votre code de vérification BeOwn',
      text: `Votre code de vérification est : ${otp}\nCe code est valable ${process.env.OTP_TTL ?? 300} secondes.`,
    });
  }

  async verify(dto: VerifyEmailOtpDto): Promise<boolean> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const key = `otp:email:${dto.email}`;
    return this.otpService.verifyOtp(key, dto.otp);
  }
}
