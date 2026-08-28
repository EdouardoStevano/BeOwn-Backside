import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TypePieceJustificative } from 'src/compliance/domain/enums/type-piece-justificative.enum';

export class DeposerPieceDto {
  @ApiProperty({
    enum: TypePieceJustificative,
    description:
      'Nature du justificatif. Une seule pièce de chaque type par société — ' +
      'redéposer remplace la précédente et relance son instruction.',
  })
  @IsEnum(TypePieceJustificative)
  type: TypePieceJustificative;

  @ApiPropertyOptional({
    description:
      'Bénéficiaire effectif documenté. Obligatoire pour ' +
      '`piece_identite_beneficiaire`, interdit pour les autres types.',
  })
  @IsOptional()
  @IsUUID()
  beneficiaireId?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      "Date d'émission du document. Exigée pour le KBIS, dont la validité est " +
      "de trois mois — c'est elle et non la date de dépôt qui la mesure.",
  })
  @IsOptional()
  @IsDateString()
  dateEmission?: string;
}

export class DeciderPieceDto {
  @ApiPropertyOptional({
    description:
      "Motif du refus. Obligatoire pour refuser : c'est ce qui dit au " +
      "titulaire quoi corriger. Ignoré à l'acceptation.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  motif?: string;
}
