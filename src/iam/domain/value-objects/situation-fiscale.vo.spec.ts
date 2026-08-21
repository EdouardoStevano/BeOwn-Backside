import { SituationFiscale } from './situation-fiscale.vo';
import { ChampProfilInvalideError } from 'src/iam/domain/errors';

/** Le champ fautif remonté au front, pour surligner la bonne entrée. */
function champFautif(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ChampProfilInvalideError) {
      return (error.details as { field: string }).field;
    }
    throw error;
  }
  throw new Error('aucune erreur levée');
}

describe('SituationFiscale — le NIF ne va pas sans sa juridiction', () => {
  it("refuse un NIF sans résidence fiscale — il n'identifierait personne", () => {
    expect(
      champFautif(() => SituationFiscale.declarer({ nif: '1234567890' })),
    ).toBe('residenceFiscale');
  });

  it('accepte le couple complet et normalise le numéro', () => {
    const situation = SituationFiscale.declarer({
      nif: '12 34 56 78 90',
      residenceFiscale: 'fr',
    });

    expect(situation.nif).toBe('1234567890');
    expect(situation.residenceFiscale).toBe('FR');
  });

  it('accepte une résidence fiscale seule', () => {
    expect(
      SituationFiscale.declarer({ residenceFiscale: 'FR' }).nif,
    ).toBeNull();
  });

  it('refuse une juridiction inexistante', () => {
    expect(
      champFautif(() => SituationFiscale.declarer({ residenceFiscale: '42' })),
    ).toBe('residenceFiscale');
  });

  it("refuse de laisser un NIF orphelin lors d'une révision", () => {
    const situation = SituationFiscale.declarer({
      nif: '1234567890',
      residenceFiscale: 'FR',
    });

    expect(champFautif(() => situation.avec({ residenceFiscale: null }))).toBe(
      'residenceFiscale',
    );
  });

  it('laisse effacer les deux ensemble', () => {
    const situation = SituationFiscale.declarer({
      nif: '1234567890',
      residenceFiscale: 'FR',
    }).avec({ nif: null, residenceFiscale: null });

    expect(situation.nif).toBeNull();
    expect(situation.residenceFiscale).toBeNull();
  });
});

describe('SituationFiscale.restore', () => {
  it('relit un couple incohérent écrit avant la règle', () => {
    const situation = SituationFiscale.restore({
      residenceFiscale: null,
      nif: 'X',
    });

    expect(situation.nif).toBe('X');
    expect(situation.residenceFiscale).toBeNull();
  });
});
