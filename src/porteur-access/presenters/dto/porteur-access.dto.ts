import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MOTIVATION_LONGUEUR_MAX,
  MOTIVATION_LONGUEUR_MIN,
  StatutDemandeAccesPorteur,
} from 'src/porteur-access/domains/demande-acces-porteur';
import {
  MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX,
  MotifRefusAccesPorteur,
} from 'src/porteur-access/domains/motif-refus';

/**
 * Dépôt d'une demande d'accès porteur.
 *
 * Les bornes viennent du domaine, elles ne sont pas recopiées : le DTO est la
 * PREMIÈRE barrière (elle rend le message d'erreur lisible et coupe court dès
 * la frontière HTTP), le domaine est la DERNIÈRE (elle vaut aussi pour un
 * import ou un script). Une seule source de vérité pour les deux.
 *
 * La version des CGU n'est PAS un champ de ce DTO : elle est figée côté
 * serveur (`CGU_VERSION_COURANTE`). Un client ne choisit pas ce qu'il est
 * réputé avoir accepté.
 */
export class SoumettreDemandeAccesPorteurDto {
  @ApiProperty({
    description:
      "Exposé du projet et de l'expérience du demandeur — lu par l'équipe qui instruit. Texte libre : il n'est recopié ni dans une notification, ni dans le journal d'audit.",
    minLength: MOTIVATION_LONGUEUR_MIN,
    maxLength: MOTIVATION_LONGUEUR_MAX,
  })
  @IsString()
  @MinLength(MOTIVATION_LONGUEUR_MIN)
  // Plafond DUR : au-delà, 400 — jamais de troncature silencieuse.
  @MaxLength(MOTIVATION_LONGUEUR_MAX)
  motivation: string;
}

/** Les deux seules décisions publiables, plus la prise en charge. */
export const DECISIONS_INSTRUCTEUR = [
  StatutDemandeAccesPorteur.EN_EXAMEN,
  StatutDemandeAccesPorteur.ACCEPTEE,
  StatutDemandeAccesPorteur.REFUSEE,
] as const;

export type DecisionInstructeur = (typeof DECISIONS_INSTRUCTEUR)[number];

/**
 * Décision d'un instructeur sur une demande.
 *
 * `retiree` est volontairement HORS de l'énumération acceptée : le retrait
 * appartient au demandeur, pas au back-office. Un `@IsEnum` sur tout
 * `StatutDemandeAccesPorteur` aurait laissé un administrateur « retirer » la
 * demande de quelqu'un d'autre.
 */
export class DeciderDemandeAccesPorteurDto {
  @ApiProperty({ enum: DECISIONS_INSTRUCTEUR })
  @IsIn(DECISIONS_INSTRUCTEUR as unknown as string[], {
    message: `decision doit valoir ${DECISIONS_INSTRUCTEUR.join(', ')}`,
  })
  decision: DecisionInstructeur;

  @ApiPropertyOptional({
    enum: MotifRefusAccesPorteur,
    description:
      'Obligatoire lorsque decision = refusee. LISTE FERMÉE : seul le libellé associé à ce code est communiqué au demandeur.',
  })
  // Exigé dès la frontière quand — et seulement quand — la décision est un
  // refus. Le domaine le re-vérifie : ce DTO n'est pas le gardien du dernier
  // ressort, il est le premier.
  @ValidateIf(
    (dto: DeciderDemandeAccesPorteurDto) =>
      dto.decision === StatutDemandeAccesPorteur.REFUSEE,
  )
  @IsEnum(MotifRefusAccesPorteur)
  motifRefus?: MotifRefusAccesPorteur;

  @ApiPropertyOptional({
    description:
      "Précision libre de l'instructeur — USAGE INTERNE : jamais communiquée au demandeur (ni notification, ni export).",
    maxLength: MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX)
  motifRefusComplement?: string;
}

/** Pagination et filtre de la file de traitement du back-office. */
export class ListerDemandesAccesPorteurDto {
  @ApiPropertyOptional({ enum: StatutDemandeAccesPorteur })
  @IsOptional()
  @IsEnum(StatutDemandeAccesPorteur)
  statut?: StatutDemandeAccesPorteur;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
