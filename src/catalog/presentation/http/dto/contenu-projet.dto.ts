import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/*
 * Ces DTO valident la **forme** de l'entrée HTTP, et rien d'autre : qu'un titre
 * soit une chaîne non vide, qu'une position soit un entier positif. Les règles
 * — un titre au plus 200 caractères, une position dans les bornes de la suite,
 * un réordonnancement exhaustif — sont métier et vivent dans `BlocsDeContenu`
 * et `GalerieProjet`, où elles tiennent quel que soit le point d'entrée (§12.5).
 * Le doublon apparent sur `MaxLength(200)` est délibéré : il fait dire la règle
 * à Swagger, il ne la remplace pas.
 */

export class CreerBlocDeContenuDto {
  @ApiProperty({ example: 'Le quartier', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titre: string;

  @ApiProperty({
    description: 'Texte enrichi du bloc, en HTML',
    example: '<p>À dix minutes du centre, desservi par deux lignes…</p>',
  })
  @IsString()
  @IsNotEmpty()
  corps: string;

  @ApiPropertyOptional({
    description:
      "Rang d'insertion (0 = en tête). Absent, le bloc se pose en dernier.",
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

/** Mise à jour partielle : seul ce qui est fourni est réécrit. */
export class ModifierBlocDeContenuDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titre?: string;

  @ApiPropertyOptional({ description: 'Texte enrichi du bloc, en HTML' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  corps?: string;
}

export class DeplacerDto {
  @ApiProperty({ description: 'Nouveau rang, à partir de 0', minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;
}

export class ReordonnerBlocsDto {
  @ApiProperty({
    description:
      'Identifiants de **tous** les blocs de la fiche, dans le nouvel ordre.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  blocIds: string[];
}

export class DecrirePhotoDto {
  @ApiPropertyOptional({
    description: "Texte alternatif de l'image. `null` l'efface.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  texteAlternatif?: string | null;
}

/* ── Formes rendues ────────────────────────────────────────────────────────
 *
 * Les deux schémas ci-dessous décrivent ce que le projet **porte** désormais,
 * sous les clés `blocsDeContenu` et `photos` — dans les réponses des routes de
 * contenu comme dans celles de `GET /projects`, `GET /projects/:id`,
 * `GET /projects/slug/:slug` et du lien de partage.
 *
 * Ils ne valident rien : aucune de ces formes n'entre par le corps d'une
 * requête. Un bloc s'écrit champ par champ (`CreerBlocDeContenuDto`), une photo
 * se dépose en `multipart/form-data`. Ils existent pour que le contrat de
 * sortie soit lisible dans Swagger, là où il n'était jusqu'ici décrit nulle
 * part.
 */

export class BlocDeContenuResponseDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Identifiant du bloc, à reprendre dans les routes de modification, de déplacement et de réordonnancement.',
  })
  id: string;

  @ApiProperty({ example: 'Le quartier' })
  titre: string;

  @ApiProperty({
    description: 'Texte enrichi du bloc, en HTML, tel qu’il a été saisi.',
    example: '<p>À dix minutes du centre, desservi par deux lignes…</p>',
  })
  corps: string;

  @ApiProperty({
    minimum: 0,
    description:
      'Rang d’affichage, à partir de 0. **Dérivé** : c’est le rang dans le tableau, reposé à chaque lecture — les positions sont donc toujours 0…n-1, sans trou ni doublon.',
  })
  position: number;
}

export class PhotoProjetResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description: 'URL de lecture servie par le CDN — ce que le front affiche.',
    example:
      'https://res.cloudinary.com/beown/image/upload/v1/beown/projets/x.jpg',
  })
  url: string;

  @ApiProperty({
    description:
      'Clé de l’objet dans le stockage. Sert à l’effacer ; l’URL, elle, est dérivée et peut changer de forme.',
    example: 'beown/projets/facade-abc',
  })
  cleStockage: string;

  @ApiProperty({ example: 'facade.jpg' })
  nomOriginal: string;

  @ApiProperty({
    example: 'image/jpeg',
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  })
  mimeType: string;

  @ApiProperty({ example: 240000 })
  tailleOctets: number;

  @ApiProperty({
    nullable: true,
    description: 'Texte alternatif — accessibilité et référencement.',
    example: 'Façade sur rue, vue depuis le trottoir opposé',
  })
  texteAlternatif: string | null;

  @ApiProperty({
    description:
      'Vignette du projet. **Dérivé de `position`** : la vignette *est* la photo de rang 0. Il y en a donc exactement une dès que la galerie n’est pas vide, et jamais deux — c’est une propriété de l’ordre, pas un drapeau que l’on pose.',
  })
  estPrincipale: boolean;

  @ApiProperty({
    minimum: 0,
    description:
      'Rang dans la galerie, à partir de 0. La galerie est rendue dans cet ordre : vignette d’abord, puis les vues.',
  })
  position: number;

  @ApiProperty({
    description: 'Identifiant de l’administrateur qui a déposé la photo.',
  })
  deposeePar: number;

  @ApiProperty({ format: 'date-time' })
  deposeeLe: string;
}
