import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrdreMarcheSens } from 'src/secondary-market/domains/ordre-marche';

export class CreateOrdreMarcheDto {
  @ApiProperty({ example: 'uuid-investissement' })
  @IsUUID()
  investissementId: string;

  @ApiProperty({ enum: OrdreMarcheSens })
  @IsEnum(OrdreMarcheSens)
  sens: OrdreMarcheSens;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @IsPositive()
  montant: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsPositive()
  prixUnitaire: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  valideJusquAu?: string;
}
