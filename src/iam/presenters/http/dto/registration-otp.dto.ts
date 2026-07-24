import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class VerifyRegistrationOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'Code à 6 chiffres reçu par email ou SMS' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResendRegistrationOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'email',
    enum: ['email', 'sms'],
    description: "Canal de renvoi — email par défaut ; sms nécessite un numéro de téléphone associé au compte",
  })
  @IsOptional()
  @IsIn(['email', 'sms'])
  canal?: 'email' | 'sms';
}
