import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { TypeCharge } from '../../domains/enums/type-charge.enum';

export class DeclareChargeDto {
  @ApiProperty() @IsUUID() projetId: string;
  @ApiProperty({ enum: TypeCharge }) @IsEnum(TypeCharge) type: TypeCharge;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) montant: number;
  @ApiProperty({ example: '2026-06' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periode: string;
  @ApiProperty() @IsDateString() dateOperation: string;
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  justificatifs: string[];
}
