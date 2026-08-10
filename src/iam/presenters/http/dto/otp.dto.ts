import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * DTO des endpoints OTP/2FA. Ils étaient déclarés dans les fichiers
 * `*.usecase.ts`, ce qui faisait dépendre la couche `applications/` de
 * `@nestjs/swagger` et `class-validator` — deux préoccupations purement HTTP
 * (§2, §12.5).
 */

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
  @IsString()
  otp: string;
}

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
