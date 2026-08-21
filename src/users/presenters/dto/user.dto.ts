import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Jean', minLength: 3 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  firstname: string;

  @ApiPropertyOptional({ example: 'Dupont', minLength: 3 })
  @IsString()
  @MinLength(3)
  lastname?: string;

  @ApiProperty({ example: 'jean.dupont@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123', minLength: 8 })
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  password: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jean' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstname?: string;

  @ApiPropertyOptional({ example: 'Dupont' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastname?: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'fr', enum: ['fr', 'en', 'ar'] })
  @IsOptional()
  @IsString()
  @IsIn(['fr', 'en', 'ar'])
  langue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  masquerMontants?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifMarketing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  preferredCurrency?: string;
}

/**
 * Corps des bascules de préférences (`PATCH /users/me/preferences/*`).
 *
 * M-6 — ces routes typaient leur corps par une interface inline
 * (`{ value: boolean }`), effacée à l'exécution en `Object` : le
 * `ValidationPipe` global les ignorait entièrement. Un corps absent ou d'un
 * autre type produisait une écriture silencieuse ou une 500, là où l'on
 * attend une 400.
 */
export class PreferenceBooleanDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  value: boolean;
}

export class PreferenceLangueDto {
  @ApiProperty({ example: 'fr', enum: ['fr', 'en', 'ar'] })
  @IsString()
  @IsIn(['fr', 'en', 'ar'])
  value: string;
}

export class SetUserTypeDto {
  @ApiProperty({ example: 'PP', enum: ['PP', 'PM'] })
  @IsString()
  @IsIn(['PP', 'PM'])
  userType: string;
}

export class UpdateUserAdminDto {
  @ApiPropertyOptional({ example: 'Jean' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstname?: string;

  @ApiPropertyOptional({ example: 'Dupont' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastname?: string;

  @ApiPropertyOptional({ example: 'actif', enum: ['actif', 'suspendu', 'clos'] })
  @IsOptional()
  @IsString()
  status?: string;
}
