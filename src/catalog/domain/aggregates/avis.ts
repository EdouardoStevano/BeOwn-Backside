import { ModificationReserveeALAuteurError } from '../errors';
import { Note } from '../value-objects/note.vo';

/** État complet d'un avis, tel qu'il transite depuis/vers la persistance. */
export interface AvisSnapshot {
  id: string;
  projetId: string;
  userId: number;
  note: number;
  commentaire: string | null;
  createdAt: Date;
  /** Nom d'affichage de l'auteur, joint à la lecture — jamais écrit ici. */
  userFirstname?: string | null;
  userLastname?: string | null;
}

/** Un avis qui vient d'être déposé, avant tout passage en base. */
export type AvisNaissant = Omit<
  AvisSnapshot,
  'id' | 'createdAt' | 'userFirstname' | 'userLastname'
>;

/**
 * **Avis** — la note et le commentaire qu'un investisseur laisse sur un projet.
 *
 * Second agrégat racine du contexte `catalog`, aux côtés de
 * `RealEstateProject` — et **pas** une entité de celui-ci : charger tous les
 * avis à chaque lecture d'un projet ferait grossir l'agrégat sans raison
 * (§6.1, point 5). Il référence le projet et son auteur par leur identifiant
 * (§6.2), jamais par leur modèle.
 *
 * Il remplace une classe de neuf champs publics sans un comportement (§7), que
 * **deux** contrôleurs fabriquaient à la main — `AvisController` et
 * `ProjectController` — chacun avec ses propres règles. C'est ce qui a produit
 * le désaccord que ce commit referme : l'un vérifiait que le projet est ouvert
 * aux investisseurs, l'autre non.
 *
 * L'agrégat ne porte que ce qui lui appartient vraiment :
 *
 * - **une note valide**, par {@link Note} ;
 * - **on ne modifie que le sien**. Cette garde était structurelle et non dite :
 *   la mise à jour retrouvait l'avis par le couple `(userId, projetId)`, si
 *   bien qu'on ne *pouvait* pas en toucher un autre. Une règle qu'aucun code
 *   n'énonce est une règle qu'un futur `findById` fera disparaître sans bruit.
 *
 * L'éligibilité du projet, elle, n'est pas ici : elle porte sur le projet, que
 * cet agrégat ne connaît pas. Elle reste au use case, qui a les deux sous la
 * main.
 */
export class Avis {
  private _note: Note;
  private _commentaire: string | null;
  private readonly _entete: Omit<AvisSnapshot, 'note' | 'commentaire'>;

  /** @internal Réservé à `deposer` et à `AvisOrmMapper`. */
  constructor(etat: AvisSnapshot) {
    const { note, commentaire, ...entete } = etat;
    this._note = Note.creer(note);
    this._commentaire = commentaire;
    this._entete = entete;
  }

  /** Dépose l'avis d'un compte sur un projet. */
  static deposer(depot: {
    projetId: string;
    utilisateurId: number;
    note: number;
    commentaire?: string | null;
  }): AvisNaissant {
    return {
      projetId: depot.projetId,
      userId: depot.utilisateurId,
      note: Note.creer(depot.note).valeur,
      commentaire: depot.commentaire ?? null,
    };
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * L'auteur revient sur son avis. Un avis n'a pas d'autre transition : il ne
   * se retire pas, ne se modère pas, ne change pas de projet.
   */
  modifierPar(
    utilisateurId: number,
    note: number,
    commentaire?: string | null,
  ): void {
    if (utilisateurId !== this._entete.userId) {
      throw new ModificationReserveeALAuteurError();
    }

    this._note = Note.creer(note);
    this._commentaire = commentaire ?? null;
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  get id(): string {
    return this._entete.id;
  }

  get projetId(): string {
    return this._entete.projetId;
  }

  /** Le compte qui a déposé l'avis. */
  get auteurId(): number {
    return this._entete.userId;
  }

  get note(): number {
    return this._note.valeur;
  }

  get commentaire(): string | null {
    return this._commentaire;
  }

  get createdAt(): Date {
    return this._entete.createdAt;
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): AvisSnapshot {
    return {
      ...this._entete,
      note: this._note.valeur,
      commentaire: this._commentaire,
    };
  }
}
