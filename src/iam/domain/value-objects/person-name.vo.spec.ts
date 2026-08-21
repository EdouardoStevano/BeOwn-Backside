import { InvalidPersonNameError } from 'src/iam/domain/errors';
import { FirstName, LastName } from './person-name.vo';

describe('FirstName', () => {
  it('retire les espaces de bordure', () => {
    expect(FirstName.of('  Jean  ').value).toBe('Jean');
  });

  it.each([
    ["d'apostrophe", "O'Brien"],
    ['composé', 'Jean-Luc'],
    ['à particule', 'van der Berg'],
    ['accentué', 'Zoé'],
    ['non latin', '李明'],
  ])('accepte un prénom %s', (_libelle, valeur) => {
    // Aucune liste de caractères autorisés : un filtre trop zélé refuserait
    // des gens plutôt que des données.
    expect(FirstName.of(valeur).value).toBe(valeur);
  });

  it.each([
    ['vide', ''],
    ["fait d'espaces", '   '],
    ['trop court', 'J'],
  ])('refuse un prénom %s', (_libelle, valeur) => {
    expect(() => FirstName.of(valeur)).toThrow(InvalidPersonNameError);
  });

  it('refuse au-delà de 100 caractères', () => {
    expect(() => FirstName.of('a'.repeat(101))).toThrow(InvalidPersonNameError);
  });

  it('compare par valeur, pas par référence', () => {
    expect(FirstName.of('Jean').equals(FirstName.of('Jean'))).toBe(true);
    expect(FirstName.of('Jean').equals(FirstName.of('Paul'))).toBe(false);
  });

  it('relit sans contrôler une valeur déjà persistée', () => {
    // Une ligne écrite avant que la règle n'existe doit rester lisible, sans
    // quoi le compte deviendrait inaccessible — y compris pour la corriger.
    expect(FirstName.restore('J').value).toBe('J');
  });
});

describe('LastName', () => {
  it('traite `null`, `undefined` et le vide comme une absence de nom', () => {
    expect(LastName.of(null)).toBeNull();
    expect(LastName.of(undefined)).toBeNull();
    expect(LastName.of('   ')).toBeNull();
  });

  it('applique la même règle de longueur qu’un prénom', () => {
    expect(LastName.of('Dupont')?.value).toBe('Dupont');
    expect(() => LastName.of('D')).toThrow(InvalidPersonNameError);
  });
});
