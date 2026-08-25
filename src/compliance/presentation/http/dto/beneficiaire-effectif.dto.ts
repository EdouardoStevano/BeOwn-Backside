import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateBeneficiaireEffectifDto {
  @ApiProperty({
    description:
      'UUID de la société à laquelle rattacher ce bénéficiaire. Obligatoire : ' +
      'un compte peut en déclarer plusieurs, et rien ne permet de deviner ' +
      'laquelle est visée.',
  })
  @IsUUID()
  pmId: string;

  @ApiProperty() @IsString() @IsNotEmpty() prenom: string;
  @ApiProperty() @IsString() @IsNotEmpty() nom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateNaissance?: string;
  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  nationalite?: string;
  @ApiProperty({ example: 33.33 })
  @IsNumber()
  @Min(25)
  @Max(100)
  pourcentageDetention: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pieceIdentiteDocId?: string;
}
