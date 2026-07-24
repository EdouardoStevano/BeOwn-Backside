import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InvestmentStatus,
  RemboursementMode,
} from 'src/investments/domains/enums/investment-status.enum';

export class CreateInvestmentDto {
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
    description:
      "Clé d'idempotence fournie par le client : rejouer la même requête (double clic, retry réseau) renvoie l'investissement déjà créé au lieu d'en créer un second.",
    example: 'b3f1c0de-0000-4000-8000-000000000000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

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
}
