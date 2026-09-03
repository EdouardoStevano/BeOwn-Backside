import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Pagination de la trésorerie porteur. Les bornes sont serrées : cette route
 * est appelée à chaque ouverture de la page — un `limit` libre serait une
 * invitation à balayer tout le grand livre d'un projet en une requête.
 */
export class TresoreriePaginationDto {
  @ApiPropertyOptional({
    description: 'Nombre de lignes par liste (défaut 50, max 200)',
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Décalage de pagination', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
