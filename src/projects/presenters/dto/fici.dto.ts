import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  INTITULES_SECTIONS,
  NOMBRE_MAX_PAGES,
  SECTIONS_REQUISES,
  SectionFici,
} from 'src/projects/domains/fici';

/** Bornes de saisie d'une section. Purement défensives : le fond relève du porteur. */
export const LONGUEUR_MIN_SECTION = 20;
export const LONGUEUR_MAX_SECTION = 20_000;

/** Langues acceptées : le français fait foi, l'anglais est une traduction de courtoisie. */
export const LANGUES_ACCEPTEES = ['fr', 'en'] as const;

/**
 * Toute clé du dictionnaire `sections` doit appartenir à l'énumération, et
 * chaque valeur doit être une chaîne dans les bornes. `@IsObject` seul
 * laisserait passer n'importe quelle clé : `whitelist` ne descend pas dans un
 * `Record`.
 */
export function analyserSections(valeur: unknown): string[] {
  if (valeur == null || typeof valeur !== 'object' || Array.isArray(valeur)) {
    return ['sections doit être un objet clé/valeur.'];
  }

  const erreurs: string[] = [];
  const clesValides = new Set<string>(SECTIONS_REQUISES);

  for (const [cle, texte] of Object.entries(
    valeur as Record<string, unknown>,
  )) {
    if (!clesValides.has(cle)) {
      erreurs.push(
        `Section inconnue « ${cle} ». Sections attendues : ${SECTIONS_REQUISES.join(', ')}.`,
      );
      continue;
    }
    const intitule = INTITULES_SECTIONS[cle as SectionFici];
    if (typeof texte !== 'string') {
      erreurs.push(`La section « ${intitule} » doit être du texte.`);
      continue;
    }
    const longueur = texte.trim().length;
    if (longueur === 0) {
      erreurs.push(`La section « ${intitule} » est vide.`);
      continue;
    }
    if (longueur < LONGUEUR_MIN_SECTION) {
      erreurs.push(
        `La section « ${intitule} » compte ${longueur} caractères : ${LONGUEUR_MIN_SECTION} au minimum.`,
      );
    }
    if (texte.length > LONGUEUR_MAX_SECTION) {
      erreurs.push(
        `La section « ${intitule} » dépasse ${LONGUEUR_MAX_SECTION} caractères.`,
      );
    }
  }

  return erreurs;
}

/**
 * Sans état : class-validator réutilise UNE instance de contrainte pour toutes
 * les requêtes. Mémoriser les erreurs dans un champ d'instance les ferait fuir
 * d'une requête à l'autre — le message est donc recalculé depuis la valeur.
 */
@ValidatorConstraint({ name: 'sectionsDocumentCles', async: false })
export class SectionsDocumentClesConstraint implements ValidatorConstraintInterface {
  validate(valeur: unknown): boolean {
    return analyserSections(valeur).length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    return analyserSections(args?.value).join(' ');
  }
}

export class FiciDto {
  @ApiProperty({
    description:
      "Contenu du document, section par section. Les huit clés sont requises : un contenu incomplet est refusé en 400 avec le verdict détaillé, et rien n'est enregistré.",
    example: {
      porteur_et_operation: 'SCI Horizon, immatriculée…',
      bien_et_operation: 'Immeuble de 6 lots, 420 m²…',
      societe_support: 'SCI Les Jardins, gérance…',
      conditions_souscription: 'Souscription minimale 500 €…',
      revenus_et_sortie: 'Distribution trimestrielle des loyers encaissés…',
      facteurs_de_risque: 'Actif unique, dépendance au locataire principal…',
      frais: "7 % des loyers encaissés, prélevés à l'exécution…",
      droits_et_recours: 'Reporting trimestriel, réclamation gratuite…',
    },
    additionalProperties: { type: 'string' },
  })
  @IsDefined({ message: 'sections est requis.' })
  @IsObject()
  @Validate(SectionsDocumentClesConstraint)
  sections: Partial<Record<SectionFici, string>>;

  @ApiPropertyOptional({
    description: `Nombre de pages du document produit, annexes exclues. Au-delà de ${NOMBRE_MAX_PAGES}, le document est refusé à la publication.`,
    minimum: 1,
    maximum: 200,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  nombrePages?: number;

  @ApiPropertyOptional({
    description:
      'Langue de rédaction (ISO 639-1). Le français fait foi ; une version anglaise est une traduction de courtoisie.',
    enum: LANGUES_ACCEPTEES,
    default: 'fr',
  })
  @IsOptional()
  @IsString()
  @IsIn(LANGUES_ACCEPTEES as unknown as string[])
  langue?: string;
}

/** Réponse d'erreur 400 : le verdict est rendu section par section, pas en bloc. */
export class VerdictFiciDto {
  @ApiProperty({ example: false })
  valide: boolean;

  @ApiProperty({
    description: 'Clés des sections incomplètes.',
    example: ['frais', 'droits_et_recours'],
  })
  sectionsManquantes: SectionFici[];

  @ApiProperty({
    description: 'Intitulés correspondants, prêts à afficher.',
    example: ['7 — Frais', '8 — Vos droits et vos recours'],
  })
  intitulesManquants: string[];

  @ApiProperty({
    description: 'Anomalies de forme (longueur, langue).',
    example: [],
  })
  anomalies: string[];

  @ApiProperty({ description: 'Message consolidé, prêt à afficher.' })
  message: string;
}

/** Paramètre de recherche par slug — borné pour éviter toute sonde. */
export class SlugParamDto {
  @ApiProperty({ example: 'residence-les-jardins' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  slug: string;
}
