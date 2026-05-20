import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateBailDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  loyerMensuel?: number;

  @ApiProperty({ required: false, description: 'null = supprime la date de fin' })
  @IsOptional()
  @IsDateString()
  dateFin?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contratPdfUrl?: string | null;
}

export class ResilierBailDto {
  @ApiProperty({ example: 'Locataire parti sans préavis' })
  @IsString()
  @IsNotEmpty()
  motif: string;

  @ApiProperty({ required: false, enum: ['termine', 'resilie'] })
  @IsOptional()
  @IsIn(['termine', 'resilie'])
  statutFinal?: 'termine' | 'resilie';
}
