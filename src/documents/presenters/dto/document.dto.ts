import { IsEnum, IsNotEmpty, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty({ enum: DocumentRelatedTo })
  @IsEnum(DocumentRelatedTo)
  relatedTo: DocumentRelatedTo;

  @ApiPropertyOptional({ description: "ID du projet lié (si relatedTo=PROJECT)" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @ApiPropertyOptional({ description: "ID de l'investissement lié (si relatedTo=INVESTMENT)" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  investmentId?: string;

  @ApiPropertyOptional({ description: "Rendre le document public (ex: prospectus projet)" })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: "Position d'affichage (PHOTO_PROJET uniquement)", minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ordre?: number;

  @ApiPropertyOptional({ description: "Définir comme image principale du projet (PHOTO_PROJET uniquement)" })
  @IsOptional()
  @IsBoolean()
  estPrincipale?: boolean;
}

export class SetOrdreDto {
  @ApiProperty({ description: "Nouvelle position d'affichage", minimum: 0 })
  @IsInt()
  @Min(0)
  ordre: number;
}
