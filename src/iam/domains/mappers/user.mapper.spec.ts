import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import { NO_MFA, UserMapper } from './user.mapper';

const PASSWORD_HASH = '$2b$10$empreinte-secrète';

describe('UserMapper.toPublic', () => {
  it('publie les attributs du compte, l’empreinte du mot de passe exceptée', () => {
    const user = buildUser({
      userId: 7,
      firstname: 'Jean',
      lastname: 'Dupont',
      passwordHash: PASSWORD_HASH,
      role: UserRole.INVESTISSEUR,
      status: UserStatus.ACTIF,
    });

    const publicUser = UserMapper.toPublic(user);

    expect(publicUser).toMatchObject({
      userId: 7,
      firstname: 'Jean',
      lastname: 'Dupont',
      role: UserRole.INVESTISSEUR,
      status: UserStatus.ACTIF,
    });
    expect(publicUser).not.toHaveProperty('passwordHash');
  });

  it('n’expose rien d’un compte social dépourvu de mot de passe non plus', () => {
    const user = buildUser({ passwordHash: null, socialId: 'google-123' });

    const publicUser = UserMapper.toPublic(user);

    expect(publicUser).not.toHaveProperty('passwordHash');
    expect(publicUser.socialId).toBe('google-123');
  });

  describe('état MFA', () => {
    it('omet la clé quand l’appelant ne l’a pas chargé', () => {
      // Et non `{ enabled: false }` : un compte protégé passerait pour un
      // compte sans MFA sur toute route qui ne consulte pas les facteurs.
      expect(UserMapper.toPublic(buildUser())).not.toHaveProperty('mfa');
    });

    it('publie le facteur actif quand il est fourni', () => {
      const publicUser = UserMapper.toPublic(buildUser(), {
        enabled: true,
        method: MfaMethodType.TOTP,
      });

      expect(publicUser.mfa).toEqual({
        enabled: true,
        method: MfaMethodType.TOTP,
      });
    });

    it('NO_MFA dit « aucun facteur », ce qui n’est pas « on ne sait pas »', () => {
      expect(UserMapper.toPublic(buildUser(), NO_MFA).mfa).toEqual({
        enabled: false,
        method: null,
      });
    });
  });
});

describe('UserMapper — aller-retour avec la persistance', () => {
  it('rend l’état complet, empreinte comprise', () => {
    const user = buildUser({ passwordHash: PASSWORD_HASH, userId: 7 });

    const snapshot = UserMapper.toSnapshot(user);

    expect(snapshot.passwordHash).toBe(PASSWORD_HASH);
    expect(snapshot.userId).toBe(7);
  });

  it('reconstitue un compte identique à celui dont il vient', () => {
    const original = buildUser({
      passwordHash: PASSWORD_HASH,
      lastname: 'Dupont',
    });

    const restored = UserMapper.restore(UserMapper.toSnapshot(original));

    expect(UserMapper.toSnapshot(restored)).toEqual(
      UserMapper.toSnapshot(original),
    );
  });

  it('relit une valeur que la règle actuelle refuserait', () => {
    // Une ligne écrite avant l'arrivée des Value Objects doit rester lisible :
    // valider au chargement rendrait le compte inaccessible, y compris pour
    // corriger la valeur fautive.
    const restored = UserMapper.restore(
      UserMapper.toSnapshot(buildUser({ firstname: 'Jean' })),
    );

    expect(() =>
      UserMapper.restore({
        ...UserMapper.toSnapshot(restored),
        firstname: 'J',
      }),
    ).not.toThrow();
  });
});

/**
 * `toJSON()` a été vidé de sa mise en forme au profit de {@link UserMapper},
 * mais doit rester sur l'entité : c'est le point d'accroche que `res.json()`
 * appelle tout seul. Le supprimer ne casserait aucun appel explicite — juste
 * la protection des chemins indirects, d'où ces tests.
 */
describe('User.toJSON — filet de sérialisation', () => {
  it('délègue au mapper', () => {
    const user = buildUser({ passwordHash: PASSWORD_HASH });

    expect(user.toJSON()).toEqual(UserMapper.toPublic(user));
  });

  it('laisse une sérialisation implicite sans empreinte ni champ privé', () => {
    const user = buildUser({ passwordHash: PASSWORD_HASH });

    // Ce que ferait `res.json({ user })` sur un compte glissé dans une réponse.
    const serialized = JSON.stringify({ user });

    expect(serialized).not.toContain(PASSWORD_HASH);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('_firstname');
  });
});
