import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

export class CalculateDistributionDto {
  @ApiProperty() @IsUUID() projetId: string;
  @ApiProperty({ example: '2026-06' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periode: string;
}
