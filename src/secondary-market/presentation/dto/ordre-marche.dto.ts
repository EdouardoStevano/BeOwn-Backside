import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrdreMarcheSens } from 'src/secondary-market/domain/enums/ordre-marche.enum';

export class CreateOrdreMarcheDto {
  @ApiProperty({ example: 'uuid-investissement' })
  @IsUUID()
  investissementId: string;

  @ApiProperty({ enum: OrdreMarcheSens })
  @IsEnum(OrdreMarcheSens)
  sens: OrdreMarcheSens;

  @ApiProperty({
    example: 50,
    description: 'Nombre de fractions à vendre/acheter',
  })
  @IsNumber()
  @IsPositive()
  nbFractions: number;

  @ApiProperty({ example: 100, description: 'Prix unitaire par fraction' })
  @IsNumber()
  @IsPositive()
  prixUnitaire: number;

  @ApiProperty({
    example: 5000,
    description: 'Montant total = nbFractions × prixUnitaire',
  })
  @IsNumber()
  @IsPositive()
  montant: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  valideJusquAu?: string;
}

export class ExecuteOrderDto {
  @ApiPropertyOptional({
    example: 3,
    description: 'Nombre de fractions à acheter (achat partiel). Omis = achat total.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  nbFractions?: number;
}
