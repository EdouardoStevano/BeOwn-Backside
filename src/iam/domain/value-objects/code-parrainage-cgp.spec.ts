import { CodeParrainageMalFormeError } from 'src/iam/domain/errors/cgp.errors';
import { CodeParrainageCgp } from './code-parrainage-cgp.vo';

describe('CodeParrainageCgp', () => {
  it('accepte un code bien formé', () => {
    expect(CodeParrainageCgp.of('CGP-A1B2C3D4').valeur).toBe('CGP-A1B2C3D4');
  });

  it('normalise la casse et les espaces de la saisie', () => {
    expect(CodeParrainageCgp.of('  cgp-a1b2c3d4 ').valeur).toBe(
      'CGP-A1B2C3D4',
    );
  });

  it.each([
    ['sans préfixe', 'A1B2C3D4'],
    ['trop court', 'CGP-A1B2C3'],
    ['trop long', 'CGP-A1B2C3D4E'],
    ['hors hexadécimal', 'CGP-Z1B2C3D4'],
    ['vide', ''],
  ])('refuse un code %s', (_, saisie) => {
    expect(() => CodeParrainageCgp.of(saisie)).toThrow(
      CodeParrainageMalFormeError,
    );
  });

  it('compose un code depuis une source hexadécimale', () => {
    expect(CodeParrainageCgp.depuisAlea('a1b2c3d4').valeur).toBe(
      'CGP-A1B2C3D4',
    );
  });

  it('ne retient que les huit premiers caractères de la source', () => {
    expect(CodeParrainageCgp.depuisAlea('a1b2c3d4ffff').valeur).toBe(
      'CGP-A1B2C3D4',
    );
  });

  it('relit une valeur persistée sans la valider', () => {
    // Un code écrit avant que le format n'existe doit rester lisible : le
    // refuser au chargement rendrait le compte inexploitable.
    expect(CodeParrainageCgp.restore('vieux-code')?.valeur).toBe('vieux-code');
    expect(CodeParrainageCgp.restore(null)).toBeNull();
  });
});
