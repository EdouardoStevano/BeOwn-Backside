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
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

// Helper: coerce string → number (sent by multipart or form)
const toNumber = () => Transform(({ value }) => (value != null && value !== '' ? Number(value) : value));

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

  @ApiProperty({ example: 24 })
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dureeMois: number;

  @ApiProperty({ enum: ProjectInstrument })
  @IsEnum(ProjectInstrument)
  instrument: ProjectInstrument;

  @ApiPropertyOptional({ enum: ProjectStatus, description: 'Statut initial (défaut : brouillon)' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descriptionMd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ description: 'Nombre total de fractions d\'actif' })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  nbFractions?: number;

  @ApiPropertyOptional({ description: 'Prix unitaire d\'une fraction' })
  @IsOptional()
  @toNumber()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  prixFraction?: number;

  @ApiPropertyOptional({ description: 'Prévisionnel financier (objet JSON libre)' })
  @IsOptional()
  previsionnel?: any;

  @ApiPropertyOptional({ description: 'Chronologie du projet', type: [EtapeChronologieDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapeChronologieDto)
  chronologie?: EtapeChronologieDto[];

  @ApiPropertyOptional({ description: 'Garanties offertes', type: [GarantieDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GarantieDto)
  garanties?: GarantieDto[];
}

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
}
