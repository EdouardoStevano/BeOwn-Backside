import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Corps du `PATCH /admin/settings` (M-6).
 *
 * La route typait son corps `Partial<AdminSettingsBlob>` — un type effacé à
 * l'exécution en `Object`, donc ignoré par le `ValidationPipe` global. Le
 * `...body` du merge recopiait alors n'importe quelle clé dans le JSONB des
 * réglages de plateforme. Les fusions par liste blanche
 * (`mergePlatform`/`mergeCommissions`/`mergeBroadcastSettings`) protégeaient
 * les sous-objets connus, mais rien n'empêchait d'ajouter des sections
 * entières inconnues ni d'écrire des valeurs de mauvais type.
 *
 * Les classes imbriquées sont validées (`@ValidateNested` + `@Type`), donc la
 * whitelist s'applique aussi à l'intérieur de chaque section.
 */
export class PlatformSettingsDto {
  @ApiPropertyOptional({ example: 'BeOwn' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'support@beown.fr' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+33123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string;
}

/** Taux en pourcentage : bornes explicites, un taux négatif ou > 100 n'a pas de sens. */
export class CommissionsSettingsDto {
  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  annualPlatformFeePct?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rentManagementFeePct?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  propertySaleGainFeePct?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  resaleTransactionFeePct?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  shareSaleGainFeePct?: number;
}

export class BroadcastChannelTogglesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Chaque SMS de diffusion est facturé' })
  @IsOptional()
  @IsBoolean()
  sms?: boolean;
}

export class BroadcastSettingsDto {
  @ApiPropertyOptional({ type: BroadcastChannelTogglesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BroadcastChannelTogglesDto)
  nouveauProjet?: BroadcastChannelTogglesDto;

  @ApiPropertyOptional({ type: BroadcastChannelTogglesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BroadcastChannelTogglesDto)
  ouvertureReservation?: BroadcastChannelTogglesDto;
}

export class NotificationsSettingsDto {
  @ApiPropertyOptional({ example: 'noreply@beown.fr' })
  @IsOptional()
  @IsEmail()
  defaultEmailFrom?: string;

  @ApiPropertyOptional({ example: 'weekly', enum: ['daily', 'weekly', 'monthly'] })
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  digestFrequency?: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ type: BroadcastSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BroadcastSettingsDto)
  broadcast?: BroadcastSettingsDto;
}

export class FeatureFlagsSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableSecondaryMarket?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableNews?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  enable2FAEnforcement?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  enableMultilingualContent?: boolean;
}

export class UpdateAdminSettingsDto {
  @ApiPropertyOptional({ type: PlatformSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlatformSettingsDto)
  platform?: PlatformSettingsDto;

  @ApiPropertyOptional({ type: CommissionsSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommissionsSettingsDto)
  commissions?: CommissionsSettingsDto;

  @ApiPropertyOptional({ type: NotificationsSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsSettingsDto)
  notifications?: NotificationsSettingsDto;

  @ApiPropertyOptional({ type: FeatureFlagsSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FeatureFlagsSettingsDto)
  feature_flags?: FeatureFlagsSettingsDto;
}
