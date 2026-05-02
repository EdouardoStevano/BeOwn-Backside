import {
  IsEnum,
  IsNumber,
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
  @ApiProperty({ example: 'uuid-du-projet' })
  @IsUUID()
  projetId: string;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @IsPositive()
  montant: number;

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
