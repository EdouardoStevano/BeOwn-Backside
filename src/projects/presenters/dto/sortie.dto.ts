import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class DeclareSortieDto {
  @ApiProperty() @IsUUID() projetId: string;
  @ApiProperty({ example: 260_000_000 })
  @IsNumber()
  @Min(0.01)
  prixRevente: number;
  @ApiProperty() @IsDateString() dateRevente: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  acteVentePdfUrl?: string;
}

export class MarkSortieActeeDto {
  @ApiProperty() @IsString() acteVentePdfUrl: string;
}
