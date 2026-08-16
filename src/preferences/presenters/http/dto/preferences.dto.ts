import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { LANGUES_SUPPORTEES } from 'src/preferences/domains/preferences';

/** Mise à jour groupée — le corps que le formulaire de réglages envoie. */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'fr', enum: LANGUES_SUPPORTEES })
  @IsOptional()
  @IsString()
  @IsIn(LANGUES_SUPPORTEES as unknown as string[])
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

  /**
   * Accepté par le DTO pour être **refusé par le domaine** avec un message
   * utile : le retirer d'ici rendrait un `400 property should not exist` qui
   * n'expliquerait pas où régler sa double authentification.
   */
  @ApiPropertyOptional({
    description:
      'Lecture seule — voir POST /auth/mfa/enroll et POST /auth/mfa/disable.',
  })
  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;
}

/** Corps des routes unitaires : `{ value: … }`, tel que le front l'envoie. */
export class ToggleValueDto {
  @ApiProperty()
  @IsBoolean()
  value: boolean;
}

export class LangueValueDto {
  @ApiProperty({ example: 'fr', enum: LANGUES_SUPPORTEES })
  @IsString()
  @IsIn(LANGUES_SUPPORTEES as unknown as string[])
  value: string;
}
