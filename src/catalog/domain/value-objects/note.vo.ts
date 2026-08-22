import { NoteInvalideError } from '../errors';

/**
 * **Note d'un avis** — de 1 à 5 étoiles, entière.
 *
 * Value Object (§8) : défini par sa valeur, immuable, et propriétaire de sa
 * règle de validité. Cette règle était énoncée deux fois, et jamais dans le
 * domaine — par `class-validator` sur `CreateAvisDto` (`@Min(1) @Max(5)`) et
 * par une contrainte `CHECK` sur la table. Les deux protègent bien la donnée,
 * mais aucune ne protège le modèle : un avis déposé par un chemin qui ne passe
 * pas par HTTP — un seed, une reprise de données, un futur import — n'était
 * arrêté que par la base, et à l'écriture seulement.
 *
 * Les deux gardes restent, et c'est très bien : le DTO refuse tôt et rend un
 * message de validation propre, la contrainte `CHECK` est le dernier filet. Le
 * Value Object dit la règle **une fois pour toutes**, là où elle se lit.
 */
export class Note {
  /** La plus basse note qu'un investisseur puisse mettre. */
  static readonly MINIMUM = 1;
  /** La plus haute. */
  static readonly MAXIMUM = 5;

  private constructor(readonly valeur: number) {}

  static creer(valeur: number): Note {
    if (
      !Number.isInteger(valeur) ||
      valeur < Note.MINIMUM ||
      valeur > Note.MAXIMUM
    ) {
      throw new NoteInvalideError(valeur, Note.MINIMUM, Note.MAXIMUM);
    }

    return new Note(valeur);
  }
}
