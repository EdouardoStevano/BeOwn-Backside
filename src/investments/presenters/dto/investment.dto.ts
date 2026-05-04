import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
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
}

export class UpdateInvestmentStatusDto {
  @ApiProperty({ enum: InvestmentStatus })
  @IsEnum(InvestmentStatus)
  statut: InvestmentStatus;
}
