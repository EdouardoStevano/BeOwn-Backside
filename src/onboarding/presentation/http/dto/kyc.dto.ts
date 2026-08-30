import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycStatus } from 'src/onboarding/domain/enums/kyc-status.enum';
import { TypePieceIdentite } from 'src/onboarding/domain/enums/type-piece-identite.enum';

/**
 * Décision manuelle d'un administrateur sur un dossier en revue.
 *
 * Vivait dans `profiles/presenters/dto/profil.dto.ts`, à côté des DTO de
 * création de profil PP et PM — un fichier que la route KYC était seule à
 * partager avec eux.
 */
export class UpdateKycStatusDto {
  @ApiProperty({ enum: KycStatus })
  @IsEnum(KycStatus)
  status: KycStatus;

  @ApiPropertyOptional({ example: 'Document expiré' })
  @IsOptional()
  @IsString()
  motifRefus?: string;
}

/**
 * Le dépôt d'une pièce d'identité pour la revue manuelle.
 *
 * Le type seul : les deux faces arrivent en multipart, et la règle qui dit
 * laquelle est exigée vit dans le domaine — le DTO ne saurait pas l'écrire sans
 * la dupliquer (§12.5).
 */
export class DeposerPieceIdentiteDto {
  @ApiProperty({
    enum: TypePieceIdentite,
    description:
      'Nature du document. `verso` est obligatoire pour la seule carte ' +
      'nationale d’identité ; refusé pour le passeport, le permis de conduire ' +
      'et le titre de séjour.',
  })
  @IsEnum(TypePieceIdentite)
  type: TypePieceIdentite;
}
