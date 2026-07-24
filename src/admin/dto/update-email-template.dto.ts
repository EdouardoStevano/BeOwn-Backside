import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Champs éditables d'un template d'email (API admin V2-T2). Tous optionnels :
 * un PATCH ne touche que les champs fournis. `sujet` doit être une chaîne non
 * vide s'il est présent (un sujet vide casserait la boîte de réception) et
 * tenir dans le varchar(300) de l'entité — sans la borne, un sujet trop long
 * partait en QueryFailedError 500 au lieu d'un 400 propre. `corpsHtml` est
 * borné large (100 000) pour rendre la limite explicite plutôt qu'implicite.
 * `nom`, `description`, `variables` et `key` ne sont volontairement PAS
 * éditables (dérivés du code / immuables).
 */
export class UpdateEmailTemplateDto {
  @ApiPropertyOptional({
    description: 'Sujet (template Handlebars) — non vide si présent, max 300',
    example: 'Nouveau projet disponible : {{titre}}',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  sujet?: string;

  @ApiPropertyOptional({
    description: 'Corps HTML (template Handlebars, sans header/footer)',
    maxLength: 100_000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  corpsHtml?: string;

  @ApiPropertyOptional({
    description: "Activer/désactiver l'envoi de ce template",
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
