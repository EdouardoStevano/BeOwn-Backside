import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class DeclareLoyerDto {
  @ApiProperty() @IsUUID() bailId: string;
  @ApiProperty({ example: '2026-06' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periode: string;
  @ApiProperty() @IsNumber() @Min(0.01) montant: number;
  @ApiProperty() @IsDateString() dateEncaissement: string;
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  preuves: string[];
}
