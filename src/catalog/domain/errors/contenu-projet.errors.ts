import { CatalogError, CatalogErrorKind } from './catalog.error';

/*
 * Les erreurs du contenu éditorial d'une fiche : ses blocs de texte enrichi et
 * sa galerie de photos.
 *
 * Elles vivent dans `catalog` parce que le contenu y vit désormais — y compris
 * les images, qui étaient jusqu'ici des `SignableDocument` du contexte
 * `documents` et levaient donc des `DocumentsError`. Les trois erreurs de
 * galerie de ce contexte (`SeulesLesPhotosSontPrincipalesError`,
 * `SeulesLesPhotosOntUnOrdreError`, `DocumentSansProjetError`) disparaissent
 * avec lui : elles n'existaient que pour rattraper le fait qu'un type de
 * document servait à deux choses. Une `PhotoProjet` est toujours une image, et
 * toujours celle d'un projet — il n'y a plus rien à vérifier.
 */

// ── Les blocs de contenu ────────────────────────────────────────────────────

/** Le bloc visé n'est pas dans la fiche. */
export class BlocDeContenuIntrouvableError extends CatalogError {
  readonly kind = CatalogErrorKind.NOT_FOUND;

  constructor(blocId: string) {
    super('Bloc de contenu introuvable.', {
      code: 'BLOC_DE_CONTENU_INTROUVABLE',
      details: { blocId },
    });
  }
}

/** Un bloc s'annonce par un titre. */
export class TitreDeBlocRequisError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(longueurMax: number) {
    super(
      `Le titre d'un bloc est obligatoire et ne dépasse pas ${longueurMax} caractères.`,
      { code: 'TITRE_DE_BLOC_REQUIS', details: { longueurMax } },
    );
  }
}

/** Un bloc sans texte enrichi n'est pas un bloc. */
export class CorpsDeBlocRequisError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor() {
    super("Le contenu d'un bloc est obligatoire.", {
      code: 'CORPS_DE_BLOC_REQUIS',
    });
  }
}

/**
 * La position visée sort de la suite.
 *
 * `max` vaut `n` à l'insertion (on peut se poser après le dernier) et `n-1` au
 * déplacement (on se glisse entre des blocs existants).
 */
export class PositionDeBlocInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(position: number, max: number) {
    super(`Position de bloc invalide : attendue entre 0 et ${max}.`, {
      code: 'POSITION_DE_BLOC_INVALIDE',
      details: { position, max },
    });
  }
}

/**
 * Un réordonnancement se donne entier.
 *
 * @see BlocsDeContenu.reordonnee — pourquoi une liste partielle est refusée
 *   plutôt que complétée.
 */
export class ReordonnancementIncompletError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(attendus: string[], recus: string[]) {
    super(
      `Le réordonnancement doit citer les ${attendus.length} blocs de la fiche, une fois chacun.`,
      {
        code: 'REORDONNANCEMENT_INCOMPLET',
        details: { attendus, recus },
      },
    );
  }
}

// ── La galerie ──────────────────────────────────────────────────────────────

/** La photo visée n'est pas dans la galerie de ce projet. */
export class PhotoDeProjetIntrouvableError extends CatalogError {
  readonly kind = CatalogErrorKind.NOT_FOUND;

  constructor(photoId: string) {
    super('Photo de projet introuvable.', {
      code: 'PHOTO_DE_PROJET_INTROUVABLE',
      details: { photoId },
    });
  }
}

/** @see PositionDeBlocInvalideError — même règle, autre suite. */
export class PositionDePhotoInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(position: number, max: number) {
    super(`Position de photo invalide : attendue entre 0 et ${max}.`, {
      code: 'POSITION_DE_PHOTO_INVALIDE',
      details: { position, max },
    });
  }
}

/**
 * Une fiche s'illustre avec des images.
 *
 * Le contrôle existait dans `DocumentController`, mais portait sur l'union des
 * formats de *tous* les documents — PDF compris. Rien n'empêchait donc de
 * déposer un PDF comme photo de projet, et la galerie l'affichait.
 */
export class ImageDeProjetInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(mimeType: string) {
    super(
      'Format non autorisé pour une photo de projet. Formats acceptés : JPEG, PNG, WEBP.',
      { code: 'IMAGE_DE_PROJET_INVALIDE', details: { mimeType } },
    );
  }
}
