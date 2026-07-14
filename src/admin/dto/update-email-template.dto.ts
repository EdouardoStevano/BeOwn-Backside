import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Champs éditables d'un template d'email (API admin V2-T2). Tous optionnels :
 * un PATCH ne touche que les champs fournis. `sujet` doit être une chaîne non
 * vide s'il est présent (un sujet vide casserait la boîte de réception) ;
 * `nom`, `description`, `variables` et `key` ne sont volontairement PAS
 * éditables (dérivés du code / immuables).
 */
export class UpdateEmailTemplateDto {
  @ApiPropertyOptional({
    description: 'Sujet (template Handlebars) — non vide si présent',
    example: 'Nouveau projet disponible : {{titre}}',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sujet?: string;

  @ApiPropertyOptional({
    description: 'Corps HTML (template Handlebars, sans header/footer)',
  })
  @IsOptional()
  @IsString()
  corpsHtml?: string;

  @ApiPropertyOptional({
    description: "Activer/désactiver l'envoi de ce template",
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
