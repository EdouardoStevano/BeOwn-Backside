import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectDeclarationDto {
  @ApiProperty({ example: 'Preuve illisible.' })
  @IsString()
  @IsNotEmpty()
  motif: string;
}
