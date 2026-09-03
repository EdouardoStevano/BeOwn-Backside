import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegimeFiscal } from 'src/catalog/domain/enums/regime-fiscal.enum';

/**
 * Constitution d'une société de projet.
 *
 * Le contrat vivait dans `dto/project.dto.ts`, aux côtés de la fiche projet —
 * un voisinage qui ne tenait qu'à celui des deux routes dans le même
 * contrôleur. La SPV est un agrégat distinct du projet (§3.2 : `catalog` porte
 * `RealEstateProject` **et** `Spv`, le premier référençant le second) : son
 * contrat d'entrée suit son propre contrôleur.
 */
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
