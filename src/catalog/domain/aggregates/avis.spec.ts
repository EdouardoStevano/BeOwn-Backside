import { Avis, type AvisSnapshot } from './avis';
import {
  ModificationReserveeALAuteurError,
  NoteInvalideError,
} from '../errors';

const AUTEUR = 7;
const PROJET = 'proj-1';

const avis = (etat: Partial<AvisSnapshot> = {}) =>
  new Avis({
    id: 'avis-1',
    projetId: PROJET,
    userId: AUTEUR,
    note: 4,
    commentaire: 'Beau dossier.',
    createdAt: new Date('2026-08-15T10:00:00Z'),
    ...etat,
  });

describe('Avis — dépôt', () => {
  const depot = {
    projetId: PROJET,
    utilisateurId: AUTEUR,
    note: 5,
    commentaire: 'Excellent.',
  };

  it('retient la note, le commentaire, le projet et l’auteur', () => {
    const naissant = Avis.deposer(depot);

    expect(naissant).toEqual({
      projetId: PROJET,
      userId: AUTEUR,
      note: 5,
      commentaire: 'Excellent.',
    });
  });

  it('accepte un avis sans commentaire', () => {
    expect(
      Avis.deposer({ ...depot, commentaire: undefined }).commentaire,
    ).toBeNull();
  });

  it('refuse une note hors de l’échelle', () => {
    expect(() => Avis.deposer({ ...depot, note: 0 })).toThrow(
      NoteInvalideError,
    );
  });
});

describe('Avis — modification', () => {
  it('laisse l’auteur revenir sur sa note et son commentaire', () => {
    const a = avis();

    a.modifierPar(AUTEUR, 2, 'Finalement, moins convaincu.');

    expect(a.note).toBe(2);
    expect(a.commentaire).toBe('Finalement, moins convaincu.');
  });

  it('efface le commentaire quand il n’est pas fourni', () => {
    const a = avis();

    a.modifierPar(AUTEUR, 3);

    expect(a.commentaire).toBeNull();
  });

  it('refuse la modification à quelqu’un d’autre que l’auteur', () => {
    const a = avis();

    expect(() => a.modifierPar(99, 1)).toThrow(
      ModificationReserveeALAuteurError,
    );
  });

  it('refuse une note hors de l’échelle, et ne change rien', () => {
    const a = avis();

    expect(() => a.modifierPar(AUTEUR, 6, 'Parfait')).toThrow(
      NoteInvalideError,
    );

    expect(a.note).toBe(4);
    expect(a.commentaire).toBe('Beau dossier.');
  });

  it('ne change ni de projet ni d’auteur', () => {
    const a = avis();

    a.modifierPar(AUTEUR, 1);

    expect(a.projetId).toBe(PROJET);
    expect(a.auteurId).toBe(AUTEUR);
  });
});

describe('Avis — état rendu', () => {
  it('refuse de se reconstituer sur une note invalide', () => {
    // Une ligne corrompue en base ne devient pas un agrégat valide en silence.
    expect(() => avis({ note: 12 })).toThrow(NoteInvalideError);
  });

  it('rend un état sérialisable, sans champ privé', () => {
    const etat = avis({
      userFirstname: 'Ada',
      userLastname: 'Lovelace',
    }).snapshot();

    expect(JSON.parse(JSON.stringify(etat))).toMatchObject({
      id: 'avis-1',
      projetId: PROJET,
      userId: AUTEUR,
      note: 4,
      userFirstname: 'Ada',
      userLastname: 'Lovelace',
    });
  });
});
