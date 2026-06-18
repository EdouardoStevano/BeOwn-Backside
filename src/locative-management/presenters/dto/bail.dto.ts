import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLocataireInline {
  @ApiProperty() @IsString() @IsNotEmpty() nomComplet: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() telephone?: string;
}

export class CreateBailDto {
  @ApiProperty() @IsUUID() uniteLouableId: string;
  @ApiProperty({ type: CreateLocataireInline })
  @ValidateNested()
  @Type(() => CreateLocataireInline)
  locataire: CreateLocataireInline;
  @ApiProperty() @IsNumber() @Min(0.01) loyerMensuel: number;
  @ApiProperty() @IsDateString() dateDebut: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dateFin?: string;
  @ApiProperty() @IsUUID() spvId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() contratPdfUrl?: string;
}
