import { CatalogError, CatalogErrorKind } from './catalog.error';

/**
 * Un compte ne donne qu'un avis par projet.
 *
 * `INVALID_INPUT` et non `CONFLICT` : la `BadRequestException` remplacée
 * rendait un 400, et le front s'appuie dessus.
 *
 * > Cette erreur portait la remarque qu'elle appartenait « au contexte Avis,
 * > pas à Projects », et qu'il faudrait un jour la déplacer vers `src/avis/`.
 * > Ce contexte n'existe plus : §3.2 n'en connaissait pas, et les avis vivent
 * > désormais dans `catalog`, avec le projet dont ils dépendent entièrement.
 */
export class AvisDejaSoumisError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor() {
    super('Vous avez déjà soumis un avis pour ce projet.', {
      code: 'AVIS_DEJA_SOUMIS',
    });
  }
}

/** On ne modifie un avis que si on en a déposé un. */
export class AvisIntrouvableError extends CatalogError {
  readonly kind = CatalogErrorKind.NOT_FOUND;

  constructor() {
    super(
      'Aucun avis trouvé. Utilisez POST /avis/projet/:projetId pour en créer un.',
      { code: 'AVIS_NOT_FOUND' },
    );
  }
}

/**
 * Un avis se modifie par son auteur, et par lui seul.
 *
 * La garde était structurelle et jamais dite : la mise à jour retrouvait
 * l'avis par le couple `(userId, projetId)`, si bien qu'on ne *pouvait* pas en
 * toucher un autre. Elle est désormais énoncée par l'agrégat.
 */
export class ModificationReserveeALAuteurError extends CatalogError {
  readonly kind = CatalogErrorKind.FORBIDDEN;

  constructor() {
    super("Cet avis n'est pas le vôtre.", { code: 'NOT_AVIS_AUTHOR' });
  }
}

/**
 * La note sort de l'échelle. Ne peut venir que d'un chemin qui ne passe pas
 * par le DTO — un seed, une reprise de données : `class-validator` refuse déjà
 * les entrées HTTP hors bornes, avec son propre message.
 *
 * Les bornes sont passées par l'appelant plutôt que lues sur `Note` : l'erreur
 * ne connaît pas le Value Object, sans quoi les deux s'importeraient l'un
 * l'autre.
 */
export class NoteInvalideError extends CatalogError {
  readonly kind = CatalogErrorKind.INVALID_INPUT;

  constructor(valeur: number, minimum: number, maximum: number) {
    super(
      `Note invalide : attendue entre ${minimum} et ${maximum}, reçue ${valeur}.`,
      {
        code: 'NOTE_INVALIDE',
        details: { valeur, minimum, maximum },
      },
    );
  }
}
