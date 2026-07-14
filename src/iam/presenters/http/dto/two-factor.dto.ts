import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { TwoFactorMethod } from 'src/iam/domain/ports/two-factor.gateway';

export class EnrollTwoFactorDto {
  @ApiProperty({
    enum: TwoFactorMethod,
    example: TwoFactorMethod.TOTP,
    description:
      "Le canal à activer. Un compte n'en a qu'un : celui-ci remplacera le précédent une fois confirmé.",
  })
  @IsEnum(TwoFactorMethod)
  method: TwoFactorMethod;

  @ApiPropertyOptional({
    example: '+33612345678',
    description: 'Requis pour la méthode « sms ». Format E.164. Ignoré sinon.',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ConfirmTwoFactorDto {
  @ApiProperty({ enum: TwoFactorMethod, example: TwoFactorMethod.TOTP })
  @IsEnum(TwoFactorMethod)
  method: TwoFactorMethod;

  @ApiProperty({
    example: '123456',
    description: 'Le code reçu sur le canal, ou généré par l’application TOTP.',
  })
  @IsString()
  @Length(6, 6)
  otp: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({
    description:
      'Mot de passe actuel : retirer un facteur exige de le prouver.',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
