import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({ example: 'uuid-du-projet' })
  @IsUUID()
  projetId: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsPositive()
  montant: number;
}

export class CancelReservationDto {
  @ApiProperty({ example: "Motif de l'annulation" })
  @IsNotEmpty()
  @IsString()
  motif?: string;
}
