import { Siren } from './siren.vo';
import { ChampProfilInvalideError } from 'src/onboarding/domain/errors';

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

describe('Siren — clé de contrôle', () => {
  it('accepte des SIREN réels', () => {
    // Clés de Luhn vérifiées : ces trois numéros sont attribués et valides.
    expect(Siren.of('404833048')?.value).toBe('404833048');
    expect(Siren.of('552100554')?.value).toBe('552100554');
    expect(Siren.of('356000000')?.value).toBe('356000000');
  });

  it('refuse un numéro dont la clé ne tombe pas juste', () => {
    // 404833048 avec le dernier chiffre changé : neuf chiffres, mais faux.
    expect(champFautif(() => Siren.of('404833049'))).toBe('siren');
  });

  it('attrape une inversion de deux chiffres', () => {
    // C'est la faute de frappe que la clé de Luhn est faite pour détecter.
    expect(champFautif(() => Siren.of('404833084'))).toBe('siren');
  });

  it('ignore les séparateurs de confort des extraits Kbis', () => {
    expect(Siren.of('404 833 048')?.value).toBe('404833048');
    expect(Siren.of('404-833-048')?.value).toBe('404833048');
  });
});

describe('Siren — forme', () => {
  it('exige exactement neuf chiffres', () => {
    expect(champFautif(() => Siren.of('40483304'))).toBe('siren');
    expect(champFautif(() => Siren.of('4048330480'))).toBe('siren');
  });

  it('reconnaît un SIRET saisi à la place et le dit', () => {
    // 14 chiffres : la confusion la plus fréquente, autant l'expliquer plutôt
    // que de renvoyer « format invalide ».
    let message = '';
    try {
      Siren.of('40483304800010');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SIRET');
  });

  it("refuse ce qui n'est pas numérique", () => {
    expect(champFautif(() => Siren.of('à compléter'))).toBe('siren');
    expect(champFautif(() => Siren.of('FR40483304'))).toBe('siren');
  });

  it('traite le vide comme « non renseigné »', () => {
    expect(Siren.of(null)).toBeNull();
    expect(Siren.of(undefined)).toBeNull();
    expect(Siren.of('')).toBeNull();
    expect(Siren.of('   ')).toBeNull();
  });
});

describe('Siren.restore', () => {
  it('relit un numéro écrit avant que la règle existe', () => {
    // Refuser au chargement rendrait le profil inaccessible — y compris pour
    // corriger le numéro fautif.
    expect(Siren.restore('123')?.value).toBe('123');
    expect(Siren.restore(null)).toBeNull();
  });
});
