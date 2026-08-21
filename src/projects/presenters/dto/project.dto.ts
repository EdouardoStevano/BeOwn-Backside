import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  IsUrl,
  IsLatitude,
  IsLongitude,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsSafeHtml } from 'src/common/validation/safe-html';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import { RegimeFiscal } from 'src/projects/domains/enums/regime-fiscal.enum';

// Helper: coerce string → number (sent by multipart or form)
const toNumber = () =>
  Transform(({ value }) =>
    value != null && value !== '' ? Number(value) : value,
  );

export class EtapeChronologieDto {
  @ApiProperty()
  @IsString()
  etape: string;

  @ApiProperty({ example: '2025-06-01' })
  @IsString()
  date: string;

  @ApiProperty({ enum: ['done', 'in_progress', 'pending'] })
  @IsString()
  statut: 'done' | 'in_progress' | 'pending';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class GarantieDto {
  @ApiProperty({ example: 'Hypothèque de premier rang' })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  rang?: number;
}

export class CreateProjectDto {
  @ApiProperty({ example: 'Résidence Les Arcs - Lyon' })
  @IsNotEmpty()
  @IsString()
  titre: string;

  @ApiPropertyOptional({ example: 'residence-les-arcs-lyon' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  spvId?: string;

  @ApiProperty({ enum: ProjectType })
  @IsEnum(ProjectType)
  type: ProjectType;

  @ApiPropertyOptional({ example: 'Lyon' })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ example: 'Auvergne-Rhône-Alpes' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  pays?: string;

  @ApiProperty({ example: 500000 })
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(5_000_000, {
    message:
      'Capital cible maximum : 5 000 000 €. Ce plafond est celui du PORTEUR sur douze mois glissants (art. 1(2)(c) du règlement (UE) 2020/1503) : la validation ci-dessous ne borne qu\'une offre isolée, l\'agrégation par porteur est vérifiée par CreateProjectUseCase.',
  })
  capitalCible: number;

  @ApiProperty({ example: 300000 })
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  capitalMinimum: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  ticketMinimum?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  ticketMaximum?: number;

  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  triCible?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Échelle de risque du projet : 1 (très faible) à 5 (très élevé)',
  })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  indiceRisque?: number;

  @ApiProperty({ example: 24 })
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dureeMois: number;

  @ApiProperty({ enum: ProjectInstrument })
  @IsEnum(ProjectInstrument)
  instrument: ProjectInstrument;

  @ApiPropertyOptional({
    enum: ProjectStatus,
    description: 'Statut initial (défaut : brouillon)',
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  statut?: ProjectStatus;

  @ApiPropertyOptional({ description: 'Date de publication ISO 8601' })
  @IsOptional()
  @IsDateString()
  datePublication?: string;

  @ApiPropertyOptional({ description: "Date d'ouverture de collecte ISO 8601" })
  @IsOptional()
  @IsDateString()
  dateOuvertureCollecte?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  estPreInvestissable?: boolean;

  @ApiPropertyOptional({ example: 400000 })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  plafondPreInvestissement?: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateCloturePrevue?: string;

  // Rendus en HTML côté public via RichTextDisplay → même contrôle que les
  // actualités (H-D).
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsSafeHtml()
  descriptionMd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsSafeHtml()
  avertissementMd?: string;

  @ApiPropertyOptional({ example: '5 Rue de la Paix, Dakar' })
  @IsOptional()
  @IsString()
  adresseComplete?: string;

  @ApiPropertyOptional({ example: 14.6928 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -17.4467 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=xxxx' })
  @IsOptional()
  @IsUrl()
  youtubeUrl?: string;

  @ApiPropertyOptional({ description: "Nombre total de fractions d'actif" })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  nbFractions?: number;

  @ApiPropertyOptional({ description: "Prix unitaire d'une fraction" })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  prixFraction?: number;

  @ApiPropertyOptional({
    description: 'Prévisionnel financier (objet JSON libre)',
  })
  @IsOptional()
  previsionnel?: any;

  @ApiPropertyOptional({
    description: 'Chronologie du projet',
    type: [EtapeChronologieDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapeChronologieDto)
  chronologie?: EtapeChronologieDto[];

  @ApiPropertyOptional({
    description: 'Garanties offertes',
    type: [GarantieDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GarantieDto)
  garanties?: GarantieDto[];
}

/**
 * DTO de mise à jour partielle d'un projet (`PATCH /projects/:id`).
 *
 * Correctif L-4 — l'ancien handler typait le body `Partial<CreateProjectDto>`,
 * un type TypeScript qui s'efface en `Object` au runtime : le `ValidationPipe`
 * global (whitelist + forbidNonWhitelisted) ne valide pas les métatypes natifs
 * et laissait donc passer des champs arbitraires jusqu'au use case. En héritant
 * de `CreateProjectDto` via `PartialType`, on obtient une VRAIE classe qui
 * conserve toutes les contraintes de validation (rendues optionnelles), ce qui
 * réactive la whitelist : les champs inconnus sont rejetés (400), les champs
 * fournis sont validés, les champs absents sont ignorés.
 */
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class UpdateProjectStatusDto {
  @ApiProperty({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  statut: ProjectStatus;
}

export class CreateSpvDto {
  @ApiProperty({ example: 'SPV Lyon Résidence SAS' })
  @IsNotEmpty()
  @IsString()
  raisonSociale: string;

  @ApiPropertyOptional({ example: '987654321' })
  @IsOptional()
  @IsString()
  siren?: string;

  @ApiPropertyOptional({ example: 'SAS' })
  @IsOptional()
  @IsString()
  forme?: string;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsNumber()
  capitalSocial?: number;

  @ApiPropertyOptional({ example: '10 avenue du Projet, 69001 Lyon' })
  @IsOptional()
  @IsString()
  siegeAdresse?: string;

  @ApiProperty({ required: false, example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  dateConstitution?: string;

  @ApiProperty({ required: false, example: 'https://storage/statuts.pdf' })
  @IsOptional()
  @IsString()
  statutsPdfUrl?: string;

  @ApiProperty({
    required: false,
    enum: RegimeFiscal,
    example: RegimeFiscal.IS,
  })
  @IsOptional()
  @IsEnum(RegimeFiscal)
  regimeFiscal?: RegimeFiscal;

  @ApiProperty({ required: false, example: 42 })
  @IsOptional()
  @IsInt()
  gestionnaireUserId?: number;
}
