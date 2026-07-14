import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInDto {
  @ApiProperty({ example: 'user@example.com', description: 'Adresse email' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Mot de passe (8 caractères minimum)',
    minLength: 8,
  })
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

/** Seconde étape du sign-in, quand le compte a un second facteur actif. */
export class VerifyTwoFactorSignInDto {
  @ApiProperty({
    description:
      'Le challengeToken renvoyé par /auth/sign-in. Valable 5 minutes.',
  })
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiProperty({
    example: '123456',
    description:
      'Le code reçu par email/SMS, ou généré par l’application TOTP.',
  })
  @IsString()
  @Length(6, 6)
  otp: string;
}
