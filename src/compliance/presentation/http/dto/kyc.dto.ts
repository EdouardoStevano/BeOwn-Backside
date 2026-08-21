import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';

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
