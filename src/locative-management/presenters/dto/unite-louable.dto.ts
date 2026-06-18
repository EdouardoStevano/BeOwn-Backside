import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AddUniteLouableDto {
  @ApiProperty() @IsUUID() projetId: string;
  @ApiProperty({ example: 'Appartement 3B' }) @IsString() reference: string;
  @ApiProperty({ required: false, example: 65 })
  @IsOptional()
  @IsNumber()
  surfaceM2?: number;
  @ApiProperty({ example: 150000 }) @IsNumber() @Min(0.01) loyerMensuelCible: number;
}
