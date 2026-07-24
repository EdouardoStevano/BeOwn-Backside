import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import { SMS_SERVICE, type SmsService } from 'src/common/sms/sms.service';

export class SendSmsOtpDto {
  @ApiProperty({ example: '+33612345678', description: 'E.164 phone number' })
  @IsString()
  phone: string;
}

export class VerifySmsOtpDto {
  @ApiProperty({ example: '+33612345678' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;
}

// Normalize phone to a stable cache key (strip spaces, ensure leading +)
const normalize = (p: string): string => p.replace(/\s+/g, '').trim();

@Injectable()
export class CreateSmsOtpUseCase {
  private readonly logger = new Logger(CreateSmsOtpUseCase.name);

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {}

  async send(dto: SendSmsOtpDto): Promise<void> {
    const phone = normalize(dto.phone);
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new BadRequestException(
        'Numéro de téléphone invalide (format E.164 attendu, ex: +33612345678).',
      );
    }

    const key = `otp:sms:${phone}`;
    const hasActive = await this.otpService.hasActiveOtp(key);
    if (hasActive) {
      throw new BadRequestException(
        'Un code est déjà actif sur ce numéro, veuillez patienter.',
      );
    }

    const otp = await this.otpService.generateOtp(key);

    try {
      await this.smsService.sendOtp(phone, otp);
    } catch (err) {
      // Si l'envoi SMS échoue, on invalide l'OTP en cache pour permettre
      // une nouvelle tentative immédiate (sinon l'utilisateur reste
      // bloqué pendant tout le TTL alors qu'il n'a jamais reçu de SMS).
      await this.otpService.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du SMS OTP à ${phone} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Impossible d\'envoyer le code par SMS. Réessayez dans un instant.',
      );
    }
  }

  async verify(dto: VerifySmsOtpDto): Promise<boolean> {
    const phone = normalize(dto.phone);
    const key = `otp:sms:${phone}`;
    return this.otpService.verifyOtp(key, dto.otp);
  }
}
