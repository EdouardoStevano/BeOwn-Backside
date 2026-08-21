import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus, UserType } from 'src/iam/domain/enums/user.enum';
import { STATUTS_ADMINISTRABLES } from 'src/iam/domain/errors';

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

/** Type d'investisseur annoncé par le titulaire à l'ouverture de son compte. */
export class SetUserTypeDto {
  @ApiProperty({ enum: UserType, example: UserType.PP })
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
   * Le champ était un `string` libre : rien ne le confrontait à l'énumération,
   * et une valeur quelconque serait entrée dans la colonne. `@IsEnum` la
   * refuse ici, `User.changerStatut` la refuse partout ailleurs.
   */
  @ApiPropertyOptional({
    example: 'actif',
    enum: STATUTS_ADMINISTRABLES,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
