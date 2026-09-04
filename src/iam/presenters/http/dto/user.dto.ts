import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrictBoolean } from 'src/common/validation/strict-boolean.decorator';
import { UserStatus, UserType } from 'src/iam/domains/enums/user.enum';

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

  // Booléens STRICTS : la conversion implicite du ValidationPipe global
  // transformait `"false"` en `true`, soit l'inverse d'un opt-out demandé.
  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  masquerMontants?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  notifEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  notifSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  notifMarketing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  twoFactorEnabled?: boolean;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  preferredCurrency?: string;

  @ApiPropertyOptional({
    description:
      'Réinvestir automatiquement les loyers nets en fractions entières du projet cible (toutes les gardes de souscription s’appliquent).',
  })
  @IsOptional()
  @IsStrictBoolean()
  reinvestLoyers?: boolean;

  @ApiPropertyOptional({
    description:
      'Projet cible du réinvestissement — null pour laisser les loyers au wallet.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  reinvestProjetId?: string | null;
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
  @IsStrictBoolean()
  value: boolean;
}

export class PreferenceLangueDto {
  @ApiProperty({ example: 'fr', enum: ['fr', 'en', 'ar'] })
  @IsString()
  @IsIn(['fr', 'en', 'ar'])
  value: string;
}

export class SetUserTypeDto {
  @ApiProperty({ example: UserType.PP, enum: UserType })
  @IsEnum(UserType)
  userType: UserType;
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

  /**
   * `@IsString()` seul laissait passer N'IMPORTE QUELLE chaîne comme statut de
   * compte : la valeur partait telle quelle en base, et aucune garde ne
   * l'attrapait ensuite — `AccountStatusGuard` ne refuse que SUSPENDU, CLOS et
   * SUPPRIME, si bien qu'un statut corrompu laissait le compte pleinement
   * actif. Le vocabulaire du domaine est la seule liste admissible.
   */
  @ApiPropertyOptional({ example: UserStatus.ACTIF, enum: UserStatus })
  @IsOptional()
  @IsIn(Object.values(UserStatus))
  status?: UserStatus;
}
