import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  PIECES_EXIGEES_DE_LA_SOCIETE,
  PIECES_EXIGEES_DU_BENEFICIAIRE,
  TypePieceJustificative,
} from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { TypePieceIdentite } from 'src/compliance/domain/enums/type-piece-identite.enum';

/**
 * Le dépôt d'une pièce **de la société** : `POST .../pieces`.
 *
 * Aucun `beneficiaireId` — ni dans le corps, ni dans l'URL. C'est ce que la
 * route dit d'elle-même : le KBIS, les statuts et la liste des actionnaires
 * décrivent l'entreprise prise comme un tout, et rien ne doit pouvoir les
 * rattacher à une personne. Les pièces nominatives ont leur propre route.
 */
export class DeposerPieceDto {
  @ApiProperty({
    enum: PIECES_EXIGEES_DE_LA_SOCIETE,
    description:
      'Nature du justificatif. Une seule pièce de chaque type par société — ' +
      'redéposer remplace la précédente et relance son instruction.',
  })
  @IsEnum(TypePieceJustificative)
  @IsIn(PIECES_EXIGEES_DE_LA_SOCIETE, {
    message:
      'Ce justificatif documente un bénéficiaire effectif : déposez-le sur ' +
      '/profiles/pm/{societeId}/pieces/{beneficiaireId}.',
  })
  type: TypePieceJustificative;

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

/**
 * Le dépôt d'une pièce **d'un bénéficiaire effectif** :
 * `POST .../pieces/:beneficiaireId`.
 *
 * La personne documentée est dans l'URL, où elle désigne la ressource, et non
 * dans le corps où elle n'était qu'un champ parmi d'autres — un dépôt qui
 * l'oubliait ne se distinguait pas d'un dépôt de société.
 */
export class DeposerPieceDuBeneficiaireDto {
  @ApiProperty({
    enum: PIECES_EXIGEES_DU_BENEFICIAIRE,
    description:
      'Nature du justificatif. Deux documents par bénéficiaire déclaré : son ' +
      'formulaire DBE-S1 et sa pièce d’identité — celle-ci recto **et** verso.',
  })
  @IsEnum(TypePieceJustificative)
  @IsIn(PIECES_EXIGEES_DU_BENEFICIAIRE, {
    message:
      'Ce justificatif documente la société, pas un bénéficiaire : déposez-le ' +
      'sur /profiles/pm/{societeId}/pieces.',
  })
  type: TypePieceJustificative;

  @ApiPropertyOptional({
    enum: TypePieceIdentite,
    description:
      "Quel document d'identité est déposé. **Obligatoire** pour " +
      '`piece_identite_beneficiaire`, interdit pour le DBE-S1. ' +
      "C'est lui, et non le type, qui décide du verso : exigé pour la seule " +
      "carte nationale d'identité, dont la date d'expiration est au dos, et " +
      'refusé pour les trois autres, qui se prouvent en une seule page.',
  })
  @IsOptional()
  @IsEnum(TypePieceIdentite)
  natureIdentite?: TypePieceIdentite;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      "Date d'émission du document. Aucune des deux pièces nominatives n'a " +
      'aujourd’hui de durée de validité — cf. `VALIDITE_EN_MOIS`.',
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
