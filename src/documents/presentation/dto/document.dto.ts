import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domain/enums/document-type.enum';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty({ enum: DocumentRelatedTo })
  @IsEnum(DocumentRelatedTo)
  relatedTo: DocumentRelatedTo;

  @ApiPropertyOptional({
    description: 'ID du projet lié (si relatedTo=PROJECT)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @ApiPropertyOptional({
    description: "ID de l'investissement lié (si relatedTo=INVESTMENT)",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  investmentId?: string;

  @ApiPropertyOptional({
    description: 'Rendre le document public (ex: prospectus projet)',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/*
 * `ordre`, `estPrincipale` et `SetOrdreDto` ont disparu : ils ne servaient
 * qu'aux `PHOTO_PROJET`, qui sont passées dans le contexte Catalog. Une photo de
 * fiche se dépose sur `POST /projects/{id}/photos`, se réordonne sur
 * `PATCH /projects/{id}/photos/{photoId}/position`, et se désigne vignette sur
 * `PATCH /projects/{id}/photos/{photoId}/principale`.
 */
