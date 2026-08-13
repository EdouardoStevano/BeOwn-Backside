import { InvalidPersonNameError } from 'src/iam/domains/errors';
import { User } from './user';
import { buildUser } from './user.fixture';

const registerProps = {
  firstname: 'Jean',
  lastname: null,
  email: 'user@example.com',
  passwordHash: 'hashed',
  socialId: null,
};

describe('User — identité du titulaire', () => {
  it('normalise le prénom à la création', () => {
    const user = User.register({ ...registerProps, firstname: '  Jean  ' });

    expect(user.firstname).toBe('Jean');
  });

  it('refuse de créer un compte au prénom invalide, quel que soit l’appelant', () => {
    expect(() => User.register({ ...registerProps, firstname: 'J' })).toThrow(
      InvalidPersonNameError,
    );
  });

  it('applique la même règle au renommage qu’à l’inscription', () => {
    const user = buildUser();

    expect(() => user.rename('J')).toThrow(InvalidPersonNameError);
    expect(user.rename('Jeanne')).toBe(true);
    expect(user.firstname).toBe('Jeanne');
  });

  it('ne signale aucun changement quand le nouveau nom est le même', () => {
    const user = buildUser({ firstname: 'Jean' });

    expect(user.rename('  Jean  ')).toBe(false);
  });

  it('sait se projeter même chargé avant son mapper', () => {
    // `user.ts` et `user.mapper.ts` s'importent mutuellement — l'entité pour
    // déléguer `toJSON()`, le mapper pour construire l'entité. Ce test charge
    // l'entité en premier (cf. les imports en tête de fichier) et vérifie que
    // la délégation fonctionne quand même ; `user.mapper.spec.ts` couvre
    // l'ordre inverse.
    const user = buildUser({ firstname: 'Jean' });

    expect(user.toJSON().firstname).toBe('Jean');
  });

  it('efface le nom de famille quand on le vide', () => {
    const user = buildUser({ lastname: 'Dupont' });

    expect(user.rename(undefined, null)).toBe(true);
    expect(user.lastname).toBeNull();
  });
});
