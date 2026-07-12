import { User } from './user';
import { UserEmail } from './value-objects/user-email.vo';
import { InvalidEmailError } from './errors/user.errors';
import { UserRole, UserStatus, UserType } from './enums/user.enum';

const makeUser = (): User => {
  const user = new User();
  user.userId = 1;
  user.firstname = 'Jean';
  user.lastname = 'Dupont';
  user.role = UserRole.INVESTISSEUR;
  user.status = UserStatus.CREE;
  user.userEmail = UserEmail.create('Jean.Dupont@Example.COM ');
  return user;
};

describe('UserEmail', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(UserEmail.create('  Jean.Dupont@Example.COM ').email).toBe(
      'jean.dupont@example.com',
    );
  });

  it('rejects a malformed address', () => {
    expect(() => UserEmail.create('not-an-email')).toThrow(InvalidEmailError);
  });

  it('records the date on verification, and is idempotent', () => {
    const email = UserEmail.create('a@b.com');
    expect(email.isVerified).toBe(false);

    email.verify();
    const first = email.verifiedDate;
    expect(email.isVerified).toBe(true);
    expect(first).toBeInstanceOf(Date);

    email.verify();
    expect(email.verifiedDate).toBe(first);
  });

  it('restores from persistence without replaying any rule', () => {
    // Une adresse déjà en base peut être hors du format courant : la relire ne
    // doit pas la faire échouer.
    const email = UserEmail.restore('LEGACY@b.com', true, null);
    expect(email.email).toBe('LEGACY@b.com');
    expect(email.isVerified).toBe(true);
  });
});

describe('User', () => {
  it('exposes email verification through the aggregate', () => {
    const user = makeUser();
    expect(user.isEmailVerified).toBe(false);

    user.verifyEmail();

    expect(user.isEmailVerified).toBe(true);
    expect(user.userEmail.isVerified).toBe(true);
  });

  it('renames without clobbering the fields left undefined', () => {
    const user = makeUser();

    user.rename('Jeanne');

    expect(user.firstname).toBe('Jeanne');
    expect(user.lastname).toBe('Dupont');
  });

  it('clears the lastname when explicitly given null', () => {
    const user = makeUser();

    user.rename(undefined, null);

    expect(user.firstname).toBe('Jean');
    expect(user.lastname).toBeNull();
  });

  it('soft-deletes rather than dropping the record', () => {
    const user = makeUser();

    user.markAsDeleted();

    expect(user.status).toBe(UserStatus.SUPPRIME);
    expect(user.isDeleted).toBe(true);
  });

  it('knows which roles grant back-office access', () => {
    const user = makeUser();
    expect(user.isAdmin).toBe(false);

    user.changeRole(UserRole.COMPLIANCE);
    expect(user.isAdmin).toBe(true);

    user.changeRole(UserRole.PORTEUR);
    expect(user.isAdmin).toBe(false);
  });

  it('takes a hash, never a plain password', () => {
    const user = makeUser();
    expect(user.hasPassword).toBe(false);

    user.changePassword('$2b$10$hash');

    expect(user.password).toBe('$2b$10$hash');
    expect(user.hasPassword).toBe(true);
  });

  it('records the investor type', () => {
    const user = makeUser();

    user.setUserType(UserType.PM);

    expect(user.userType).toBe(UserType.PM);
  });
});
