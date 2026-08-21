import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CategorieReclamation,
  StatutReclamation,
} from 'src/reclamations/domains/reclamation';

/**
 * Formulaire standard de dépôt d'une réclamation — le règlement délégué
 * (UE) 2022/2117 impose un format normalisé et un dépôt gratuit.
 */
export class CreateReclamationDto {
  @ApiProperty({ enum: CategorieReclamation })
  @IsEnum(CategorieReclamation)
  categorie: CategorieReclamation;

  @ApiProperty({ example: 'Distribution de loyers non reçue' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  objet: string;

  @ApiProperty({
    description:
      'Exposé des faits. Le prestataire répond en langage clair dans un délai de deux mois.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({ description: 'Projet concerné, le cas échéant' })
  @IsOptional()
  @IsUUID()
  projetId?: string;

  @ApiPropertyOptional({ description: 'Investissement concerné, le cas échéant' })
  @IsOptional()
  @IsUUID()
  investissementId?: string;
}

/** Réponse apportée par le prestataire. Réservée au back-office. */
export class RepondreReclamationDto {
  @ApiProperty({ description: 'Réponse motivée, en langage clair' })
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  reponse: string;

  @ApiProperty({
    enum: [StatutReclamation.RESOLUE, StatutReclamation.REJETEE],
    description: 'Issue donnée à la réclamation',
  })
  @IsEnum(StatutReclamation)
  statut: StatutReclamation;
}
