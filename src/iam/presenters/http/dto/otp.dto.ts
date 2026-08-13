import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/**
 * DTO des OTP de **connexion** (`/auth/otp/*`) : un code envoyé à une adresse
 * ou un numéro, sans second facteur enrôlé derrière. Ils étaient déclarés dans
 * les fichiers `*.usecase.ts`, ce qui faisait dépendre la couche
 * `applications/` de `@nestjs/swagger` et `class-validator` — deux
 * préoccupations purement HTTP (§2, §12.5).
 *
 * Le cycle de vie du second facteur (enrôlement, activation, défi, retrait)
 * vit dans `mfa.dto.ts` : ce sont deux parcours distincts, servis par des
 * routes distinctes, et leurs codes sont cloisonnés.
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
