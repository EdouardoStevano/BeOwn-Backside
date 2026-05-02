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
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

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
  @IsNumber()
  @IsPositive()
  capitalCible: number;

  @ApiProperty({ example: 300000 })
  @IsNumber()
  @IsPositive()
  capitalMinimum: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  ticketMinimum?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  ticketMaximum?: number;

  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @IsNumber()
  triCible?: number;

  @ApiProperty({ example: 24 })
  @IsNumber()
  @IsPositive()
  dureeMois: number;

  @ApiProperty({ enum: ProjectInstrument })
  @IsEnum(ProjectInstrument)
  instrument: ProjectInstrument;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  estPreInvestissable?: boolean;

  @ApiPropertyOptional({ example: 400000 })
  @IsOptional()
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
