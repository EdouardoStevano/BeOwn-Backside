import { InvalidEmailError } from 'src/iam/domains/errors';
import { Email } from './email.vo';

describe('Email — validation de la chaîne saisie', () => {
  it('normalise casse et espaces de bordure', () => {
    expect(Email.of('  User@Example.COM  ').value).toBe('user@example.com');
  });

  it.each([
    ['vide', ''],
    ['espaces seuls', '   '],
    ['sans arobase', 'user.example.com'],
    ['sans domaine', 'user@'],
    ['sans partie locale', '@example.com'],
    ['domaine sans point', 'user@example'],
    ['espace interne', 'user name@example.com'],
    ['deux arobases', 'user@@example.com'],
  ])('refuse une adresse %s', (_, raw) => {
    expect(() => Email.of(raw)).toThrow(InvalidEmailError);
  });

  it('refuse au-delà de 254 caractères', () => {
    const raw = `${'a'.repeat(250)}@example.com`;

    expect(() => Email.of(raw)).toThrow(InvalidEmailError);
  });

  it.each([
    ['sous-adressage', 'user+tag@example.com'],
    ['sous-domaine', 'user@mail.example.co.uk'],
    ['tiret et chiffres', 'jean-luc.2026@example-mail.fr'],
  ])('accepte une adresse légitime (%s)', (_, raw) => {
    expect(Email.of(raw).value).toBe(raw);
  });

  it('relit sans contrôle une adresse déjà stockée', () => {
    // Une ligne écrite avant que la règle n'existe doit rester lisible, sinon
    // le compte devient inaccessible — y compris pour corriger son adresse.
    expect(Email.restore('legacy-sans-arobase').value).toBe(
      'legacy-sans-arobase',
    );
  });

  it('compare par valeur, pas par identité', () => {
    expect(
      Email.of('user@example.com').equals(Email.of('USER@example.com')),
    ).toBe(true);
    expect(Email.of('a@example.com').equals(Email.of('b@example.com'))).toBe(
      false,
    );
    expect(Email.of('a@example.com').equals(null)).toBe(false);
  });
});
