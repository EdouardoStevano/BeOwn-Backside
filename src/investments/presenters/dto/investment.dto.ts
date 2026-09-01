import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InvestmentStatus,
  RemboursementMode,
} from 'src/investments/domains/enums/investment-status.enum';

export class CreateInvestmentDto {
  @ApiPropertyOptional({ description: 'Clé idempotente fournie par le client' })
  @IsOptional()
  @IsString()
  @Length(16, 128)
  idempotencyKey?: string;

  @ApiProperty({ description: 'UUID du projet', example: 'uuid-du-projet' })
  @IsUUID()
  projetId: string;

  @ApiProperty({
    description: 'Nombre de fractions à acheter (1 fraction = prixFraction du projet)',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  nbFractions: number;

  @ApiPropertyOptional({ enum: RemboursementMode })
  @IsOptional()
  @IsEnum(RemboursementMode)
  modeRemboursement?: RemboursementMode;

  @ApiPropertyOptional({ example: 'uuid-de-la-reservation' })
  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @ApiPropertyOptional({
    description: 'Consentement explicite pour dépasser la limite recommandée (non-avertis uniquement). Le client doit cocher cette case si le montant dépasse max(1000€, 5% du patrimoine déclaré).',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  consentementDepassementLimite?: boolean;
}

export class UpdateInvestmentStatusDto {
  @ApiProperty({ enum: InvestmentStatus })
  @IsEnum(InvestmentStatus)
  statut: InvestmentStatus;
}

export class TopUpDto {
  @ApiProperty({ description: 'Nombre de fractions à rajouter', example: 4, minimum: 1 })
  @IsInt()
  @IsPositive()
  nbFractions: number;

  /**
   * Même garde que `CreateInvestmentDto` : un double-clic ou un retry réseau
   * sur l'ajout de fractions ne doit pas débiter deux fois.
   */
  @ApiPropertyOptional({ description: 'Clé idempotente fournie par le client' })
  @IsOptional()
  @IsString()
  @Length(16, 128)
  idempotencyKey?: string;
}
