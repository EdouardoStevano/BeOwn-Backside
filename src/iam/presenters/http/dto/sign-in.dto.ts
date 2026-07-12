import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInDto {
  @ApiProperty({ example: 'user@example.com', description: 'Adresse email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Mot de passe (8 caractères minimum)', minLength: 8 })
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
