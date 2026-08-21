import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, Matches } from 'class-validator';

export class TestEmailDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail({}, { message: 'Adresse email invalide' })
  to!: string;
}

export class TestSmsDto {
  @ApiProperty({ example: '+33600000000' })
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Numéro de téléphone invalide (format E.164 attendu, ex. +33600000000)',
  })
  to!: string;
}
