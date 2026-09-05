import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Déclaration d'un versement au porteur effectué HORS plateforme.
 * Aucun virement n'est exécuté : on enregistre un fait bancaire passé.
 */
export class DeclarerVersementPorteurDto {
  @ApiProperty({
    description:
      'Référence du virement bancaire effectué hors plateforme (clé d’idempotence par projet).',
    example: 'VIR-2026-08-0042',
  })
  @IsString()
  @IsNotEmpty({ message: 'La référence bancaire est obligatoire.' })
  @MaxLength(140)
  referenceBancaire: string;

  @ApiProperty({
    description: 'Date à laquelle le virement a été effectué (ISO 8601).',
    example: '2026-08-29',
  })
  @IsDateString(
    {},
    { message: 'La date de versement doit être une date ISO valide.' },
  )
  dateVersement: string;

  @ApiPropertyOptional({
    description:
      'Montant versé en devise du wallet projet. À défaut, tout le restant dû.',
    example: 25000,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Le montant doit être strictement positif.' })
  montant?: number;

  @ApiPropertyOptional({ description: 'Commentaire libre (journal d’audit).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}

/** Filtres du tableau financier paginé du back-office. */
export class ListerEtatsFinanciersDto {
  @ApiPropertyOptional({ description: 'Page (défaut : 1).', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Taille de page (défaut : 25, maximum : 100).',
    example: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtre sur le statut du projet.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  statut?: string;
}
