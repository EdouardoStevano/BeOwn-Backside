import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// `RegisterDto` a été supprimé avec `POST /users` : le DTO d'inscription est
// désormais `SignUpDto` (iam/presenters/http/dto/password.dto.ts), seul point
// d'entrée du sign-up.

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

  @ApiPropertyOptional({
    example: 'actif',
    enum: ['actif', 'suspendu', 'clos'],
  })
  @IsOptional()
  @IsString()
  status?: string;
}
