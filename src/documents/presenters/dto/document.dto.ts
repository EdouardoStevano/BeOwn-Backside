import { IsEnum, IsNotEmpty, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';

/**
 * Conversion stricte d'un booleen recu en `multipart/form-data`.
 *
 * Contexte : l'upload de documents passe par `multipart/form-data`, ou toutes
 * les valeurs arrivent en chaine de caracteres. Le `ValidationPipe` global
 * (`src/main.ts`) est configure avec `enableImplicitConversion: true`, qui
 * convertit une chaine vers un booleen via `Boolean(value)` :
 * `Boolean('false') === true`. Sans cette conversion explicite, un champ
 * envoye a `"false"` remonte donc a `true`.
 *
 * Regles : seules les valeurs sans ambiguite sont acceptees.
 *  - booleens `true` / `false` : conserves tels quels ;
 *  - chaines `"true"` / `"1"` -> `true`, `"false"` / `"0"` -> `false`
 *    (espaces de bordure et casse ignores) ;
 *  - tout le reste (absent, `null`, `""`, `"oui"`, `2`, objet...) : non
 *    reconnu, donc `undefined`. Aucune valeur ambigue n'est interpretee par
 *    defaut ; c'est l'appelant qui tranche.
 */
export function parseBooleanish(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

/**
 * Fonction de `@Transform` associee.
 *
 * Deux precautions :
 *  - `params.value` a deja pu etre altere par `enableImplicitConversion`
 *    (`'false'` y arrive sous la forme `true`) : on repart donc de la valeur
 *    brute du corps de requete, disponible dans `params.obj` ;
 *  - une valeur presente mais non reconnue est renvoyee TELLE QUELLE, pour que
 *    `@IsBoolean()` la rejette en 400 au lieu d'appliquer un defaut silencieux.
 *    Un champ reellement absent (ou `null`) reste `undefined` et `@IsOptional()`
 *    le laisse passer : le controleur applique alors le defaut `false`.
 */
export function toStrictBoolean({ value, key, obj }: TransformFnParams): unknown {
  const source = obj as Record<string, unknown> | undefined;
  const raw = source && key in source ? source[key] : value;

  const parsed = parseBooleanish(raw);
  if (parsed !== undefined) return parsed;
  return raw === undefined || raw === null ? undefined : raw;
}

const BOOLEAN_MESSAGE = (champ: string) =>
  `${champ} doit etre un booleen : true, false, "true", "false", "1" ou "0".`;

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty({ enum: DocumentRelatedTo })
  @IsEnum(DocumentRelatedTo)
  relatedTo: DocumentRelatedTo;

  @ApiPropertyOptional({ description: "ID du projet lié (si relatedTo=PROJECT)" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @ApiPropertyOptional({ description: "ID de l'investissement lié (si relatedTo=INVESTMENT)" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  investmentId?: string;

  @ApiPropertyOptional({
    description:
      "Rendre le document public (ex: prospectus projet). Valeurs acceptees : true, false, \"true\", \"false\", \"1\", \"0\". Absent = false.",
    type: Boolean,
  })
  @IsOptional()
  @Transform(toStrictBoolean)
  @IsBoolean({ message: BOOLEAN_MESSAGE('isPublic') })
  isPublic?: boolean;

  @ApiPropertyOptional({ description: "Position d'affichage (PHOTO_PROJET uniquement)", minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ordre?: number;

  @ApiPropertyOptional({
    description:
      "Définir comme image principale du projet (PHOTO_PROJET uniquement). Valeurs acceptees : true, false, \"true\", \"false\", \"1\", \"0\". Absent = false.",
    type: Boolean,
  })
  @IsOptional()
  @Transform(toStrictBoolean)
  @IsBoolean({ message: BOOLEAN_MESSAGE('estPrincipale') })
  estPrincipale?: boolean;
}

export class SetOrdreDto {
  @ApiProperty({ description: "Nouvelle position d'affichage", minimum: 0 })
  @IsInt()
  @Min(0)
  ordre: number;
}
