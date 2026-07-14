import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  UserRole,
  UserStatus,
  UserType,
} from 'src/users/domains/enums/user.enum';

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

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un symbole',
  })
  password: string;
}

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Mot de passe actuel, pour confirmer la suppression',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SetUserTypeDto {
  @ApiProperty({ example: 'PP', enum: UserType })
  @IsEnum(UserType)
  userType: UserType;
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

  // Pas de `twoFactorMethod` ici, volontairement : activer un second facteur
  // suppose d'avoir prouvé qu'on reçoit les codes sur le canal choisi. Cela
  // passe par POST /auth/2fa/enroll puis /auth/2fa/confirm — jamais par une
  // simple écriture de préférence.

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  preferredCurrency?: string;
}

export class UpdateLanguePreferenceDto {
  @ApiProperty({ example: 'fr', enum: ['fr', 'en', 'ar'] })
  @IsString()
  @IsIn(['fr', 'en', 'ar'])
  value: string;
}

export class TogglePreferenceDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  value: boolean;
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

  @ApiPropertyOptional({ example: 'support', enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'actif', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
