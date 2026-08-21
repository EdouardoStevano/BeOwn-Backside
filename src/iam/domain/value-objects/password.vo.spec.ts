import { WeakPasswordError } from 'src/iam/domain/errors';
import { Password } from './password.vo';

describe('Password', () => {
  it('accepte un mot de passe conforme à la politique', () => {
    expect(Password.of('Password123').value).toBe('Password123');
  });

  it.each([
    ['trop court', 'Pass12'],
    ['sans majuscule', 'password123'],
    ['sans minuscule', 'PASSWORD123'],
    ['sans chiffre', 'PasswordOnly'],
    ['vide', ''],
  ])('refuse un mot de passe %s', (_libelle, candidat) => {
    expect(() => Password.of(candidat)).toThrow(WeakPasswordError);
  });

  it('refuse au-delà de 72 octets, où bcrypt tronque', () => {
    const trop = 'A1' + 'a'.repeat(71);

    expect(trop.length).toBeGreaterThan(72);
    expect(() => Password.of(trop)).toThrow(WeakPasswordError);
  });

  it('ne normalise rien : les espaces font partie du secret', () => {
    // Rogner ici empêcherait de se reconnecter avec ce qui a été réellement
    // tapé — contrairement à une adresse email, tout caractère compte.
    expect(Password.of('  Password123  ').value).toBe('  Password123  ');
  });

  it('ne laisse pas fuiter sa valeur dans une trace ou une réponse', () => {
    const password = Password.of('Password123');

    // `String(...)` est ce qu'appliquent une interpolation, un `console.log`
    // ou un logger structuré avant d'écrire la valeur.
    expect(String(password)).not.toContain('Password123');
    expect(JSON.stringify({ password })).not.toContain('Password123');
  });
});
