import { Note } from './note.vo';
import { NoteInvalideError } from '../errors';

describe('Note', () => {
  it('accepte les cinq notes de l’échelle', () => {
    for (const valeur of [1, 2, 3, 4, 5]) {
      expect(Note.creer(valeur).valeur).toBe(valeur);
    }
  });

  it('refuse en dessous de l’échelle', () => {
    expect(() => Note.creer(0)).toThrow(NoteInvalideError);
    expect(() => Note.creer(-1)).toThrow(NoteInvalideError);
  });

  it('refuse au-dessus de l’échelle', () => {
    expect(() => Note.creer(6)).toThrow(NoteInvalideError);
  });

  it('refuse une demi-étoile — l’échelle est entière', () => {
    expect(() => Note.creer(4.5)).toThrow(NoteInvalideError);
  });

  it('refuse ce qui n’est pas un nombre', () => {
    expect(() => Note.creer(Number.NaN)).toThrow(NoteInvalideError);
  });

  it('dit les bornes attendues dans son refus', () => {
    expect(() => Note.creer(9)).toThrow(/attendue entre 1 et 5, reçue 9/);
  });
});
