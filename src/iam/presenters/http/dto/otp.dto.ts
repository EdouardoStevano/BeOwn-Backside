import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';

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

/**
 * Enrôlement 2FA — le canal est porté par le **body** (`method`) et non plus
 * par l'URL : une seule route couvre TOTP, email et SMS, et en ajouter un
 * n'impose ni route ni DTO supplémentaire.
 */
export class EnrollTfaDto {
  @ApiProperty({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    example: TfaMethodType.TOTP,
    description: 'Canal de double authentification à enrôler.',
  })
  @IsEnum(TfaMethodType)
  method: TfaMethodType;

  @ApiPropertyOptional({
    example: '+33612345678',
    description:
      "Numéro E.164. Requis pour `sms`, ignoré pour les autres canaux — le canal `email` utilise toujours l'adresse du compte.",
  })
  // Le numéro n'est exigé (et validé) que sur le canal qui s'en sert.
  @ValidateIf((dto: EnrollTfaDto) => dto.method === TfaMethodType.SMS)
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone doit être au format E.164 (ex: +33612345678)',
  })
  phone?: string;
}

/**
 * Défi renvoyé par `POST /auth/otp/enroll`. Les champs sont **mutuellement
 * exclusifs selon le canal** : `totp` remplit `secret` + `uri` (rien n'est
 * envoyé), `email`/`sms` remplissent `sentTo` (aucun secret n'est exposé).
 *
 * Cette classe n'existe que pour documenter le schéma côté Swagger — le use
 * case rend déjà cette forme, le contrôleur n'a rien à convertir.
 */
export class TfaEnrollmentChallengeDto {
  @ApiProperty({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    description: 'Canal effectivement enrôlé.',
  })
  method: TfaMethodType;

  @ApiPropertyOptional({
    example: 'JBSWY3DPEHPK3PXP',
    description:
      'TOTP uniquement — secret partagé, pour la saisie manuelle dans une application authenticator.',
  })
  secret?: string;

  @ApiPropertyOptional({
    example: 'otpauth://totp/BeOwn:user@example.com?secret=JBSWY3DPEHPK3PXP',
    description: 'TOTP uniquement — URI `otpauth://` à encoder en QR code.',
  })
  uri?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description:
      "Email/SMS uniquement — destination vers laquelle le code vient d'être envoyé, en clair. Rien n'est masqué : la destination appartient déjà à l'appelant — l'adresse de son propre compte pour `email` (une adresse fournie dans le body est ignorée), le numéro qu'il vient de soumettre pour `sms`.",
  })
  sentTo?: string;
}

/** Confirmation de l'enrôlement : preuve de possession du facteur enrôlé. */
export class ConfirmTfaEnrollmentDto {
  @ApiProperty({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    example: TfaMethodType.TOTP,
    description: "Canal dont l'enrôlement est confirmé.",
  })
  @IsEnum(TfaMethodType)
  method: TfaMethodType;

  @ApiProperty({
    example: '123456',
    description:
      "Code TOTP généré par l'application authenticator, ou code reçu par email/SMS.",
  })
  @IsString()
  otp: string;
}
