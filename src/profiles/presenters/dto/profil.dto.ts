import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

export class CreateProfilPPDto {
  @ApiPropertyOptional({ example: 'M.', description: 'Civilité (M. / Mme)' })
  @IsOptional()
  @IsString()
  civilite?: string;

  @ApiPropertyOptional({ example: '1985-06-15' })
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @ApiPropertyOptional({ example: 'CI', description: 'Code ISO 2 pays de nationalité' })
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

  @ApiPropertyOptional({ example: 500000, description: 'Patrimoine net déclaré (€) — pour calcul limite 5% non-averti' })
  @IsOptional()
  @IsNumber()
  patrimoineDeclare?: number;

  @ApiPropertyOptional({ example: 25000, description: 'Montant max conseillé par investissement (€) — déduit du questionnaire' })
  @IsOptional()
  @IsNumber()
  montantMaxConseille?: number;
}

/**
 * Mise à jour partielle du profil personne physique.
 *
 * Doit rester une VRAIE classe : un `Partial<CreateProfilPPDto>` est effacé à
 * l'exécution (metatype `Object`), et le `ValidationPipe` global — pourtant
 * configuré en `whitelist` + `forbidNonWhitelisted` — saute les metatypes
 * natifs. Le corps arrivait donc brut jusqu'à la persistance (finding C-3) :
 * `utilisateurId` (clé primaire → écriture sur le profil d'autrui) et
 * `categoriePsfp` (plafond PSFP + délai de rétractation) étaient assignables
 * par n'importe quel utilisateur authentifié. Ces deux champs n'existant pas
 * dans `CreateProfilPPDto`, `forbidNonWhitelisted` les rejette désormais en
 * 400 — `categoriePsfp` reste calculé par le questionnaire d'adéquation.
 */
export class UpdateProfilPPDto extends PartialType(CreateProfilPPDto) {}

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

