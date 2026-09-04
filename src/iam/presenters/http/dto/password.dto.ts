import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token-xxx' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  newPassword: string;
}

export class SignUpDto {
  @ApiProperty({ example: 'Jean', minLength: 3 })
  @IsString()
  @IsNotEmpty()
  firstname: string;

  @ApiPropertyOptional({ example: 'Dupont', minLength: 3 })
  @IsString()
  @IsOptional()
  lastname?: string;

  @ApiProperty({ example: 'jean.dupont@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  password: string;

  @ApiPropertyOptional({ description: 'Token reCAPTCHA v3' })
  @IsString()
  @IsOptional()
  captchaToken?: string;

  @ApiPropertyOptional({
    example: 'BEOWN-7KM2QX',
    description:
      "Code de parrainage (optionnel). Un code inconnu ou mal formé est IGNORÉ — il ne fait jamais échouer l'inscription.",
    maxLength: 20,
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  codeParrainage?: string;

  @ApiProperty({
    example: true,
    description:
      "Acceptation explicite des CGU — l'inscription est refusée (400, code stable `CGU_NOT_ACCEPTED`) tant que la valeur n'est pas strictement `true`.",
  })
  // `@IsOptional` au DTO, PAS optionnel métier : l'exigence `=== true` vit
  // dans `RegisterUseCase` pour que l'absence du champ comme sa valeur `false`
  // produisent le MÊME 400 `CGU_NOT_ACCEPTED` (un champ requis ici rendrait un
  // 400 de validation générique sans code stable quand le champ manque).
  @IsBoolean()
  @IsOptional()
  accepteCgu?: boolean;

  @ApiProperty({
    example: '1.0',
    description:
      "Version des CGU affichée à l'utilisateur au moment de l'acceptation (persistée comme preuve de consentement).",
  })
  // Exigée dès que l'acceptation est déclarée ; quand `accepteCgu` est absent
  // ou `false`, c'est le usecase qui refuse déjà tout — inutile de valider une
  // version qui ne sera jamais lue.
  @ValidateIf((dto: SignUpDto) => dto.accepteCgu === true)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cguVersion?: string;
}
