import { RangInvalideError } from '../errors/reservation.errors';
import { Rang } from './rang.vo';

describe('Rang (Value Object)', () => {
  it('naît d’un entier strictement positif', () => {
    expect(Rang.de(1).valeur).toBe(1);
    expect(Rang.premier().valeur).toBe(1);
  });

  it.each([0, -1, 1.5, NaN])('refuse %p', (valeur) => {
    expect(() => Rang.de(valeur)).toThrow(RangInvalideError);
  });

  it('avance sans muter — un Value Object est immuable (§8)', () => {
    const troisieme = Rang.de(3);
    const quatrieme = troisieme.suivant();

    expect(troisieme.valeur).toBe(3);
    expect(quatrieme.valeur).toBe(4);
    expect(troisieme.precede(quatrieme)).toBe(true);
    expect(quatrieme.precede(troisieme)).toBe(false);
    expect(troisieme.egale(Rang.de(3))).toBe(true);
  });
});
