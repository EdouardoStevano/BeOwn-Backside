import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

export class CreateProfilPPDto {
  @ApiPropertyOptional({ example: 'M', description: 'M / Mme' })
  @IsOptional()
  @IsString()
  civilite?: string;

  @ApiProperty({ example: 'Jean' })
  @IsNotEmpty()
  @IsString()
  prenom: string;

  @ApiProperty({ example: 'Dupont' })
  @IsNotEmpty()
  @IsString()
  nom: string;

  @ApiPropertyOptional({ example: 'Martin' })
  @IsOptional()
  @IsString()
  nomNaissance?: string;

  @ApiProperty({ example: '1985-06-15' })
  @IsDateString()
  dateNaissance: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  paysNaissance?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  nationalite?: string;

  @ApiPropertyOptional({ example: '12 rue de la Paix' })
  @IsOptional()
  @IsString()
  adresseLigne1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adresseLigne2?: string;

  @ApiPropertyOptional({ example: '75001' })
  @IsOptional()
  @IsString()
  codePostal?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  pays?: string;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({ example: 'Ingénieur' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ example: 'Technologie' })
  @IsOptional()
  @IsString()
  secteurActivite?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pep?: boolean;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  residenceFiscale?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  nif?: string;
}

export class CreateProfilPMDto {
  @ApiProperty({ example: 'BeOwn SAS' })
  @IsNotEmpty()
  @IsString()
  raisonSociale: string;

  @ApiPropertyOptional({ example: 'SAS' })
  @IsOptional()
  @IsString()
  formeJuridique?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  siren?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  rcsVille?: string;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  capitalSocial?: number;

  @ApiPropertyOptional({ example: '12 rue de la Paix, 75001 Paris' })
  @IsOptional()
  @IsString()
  siegeAdresse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secteurActivite?: string;
}

export class UpdateKycStatusDto {
  @ApiProperty({ enum: KycStatus })
  @IsEnum(KycStatus)
  status: KycStatus;

  @ApiPropertyOptional({ example: 'Document expiré' })
  @IsOptional()
  @IsString()
  motifRefus?: string;
}
