import {
  AccountClosedError,
  AccountSuspendedError,
  EmailAlreadyRegisteredError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidPersonNameError,
} from 'src/iam/domain/errors';
import { UserRole, UserStatus } from 'src/iam/domain/enums/user.enum';
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

describe('User — adresse email et sa vérification', () => {
  it("normalise l'adresse à la création", () => {
    const user = User.register({
      ...registerProps,
      email: '  User@Example.COM  ',
    });

    expect(user.email).toBe('user@example.com');
  });

  it("refuse de créer un compte à l'adresse invalide, quel que soit l'appelant", () => {
    // Le DTO HTTP contrôlait déjà, mais rien ne protégeait les autres points
    // d'entrée (OAuth, import, script) — un compte pouvait naître injoignable.
    expect(() =>
      User.register({ ...registerProps, email: 'pas-une-adresse' }),
    ).toThrow(InvalidEmailError);
  });

  it('naît non vérifié, et le devient avec sa date', () => {
    const user = User.register(registerProps);
    expect(user.isEmailVerified()).toBe(false);
    expect(user.emailVerifiedDate).toBeNull();

    user.markEmailAsVerified();

    expect(user.isEmailVerified()).toBe(true);
    expect(user.emailVerifiedDate).toBeInstanceOf(Date);
  });

  it('fait avancer le statut du compte en même temps que la vérification', () => {
    // La règle vivait en deux moitiés : `verify()` sur le VO, la transition de
    // statut sur l'entité. Un appelant pouvait n'en jouer qu'une.
    const user = User.register(registerProps);
    expect(user.status).toBe(UserStatus.CREE);

    user.markEmailAsVerified();

    expect(user.status).toBe(UserStatus.EMAIL_VERIFIE);
  });

  it('reste idempotent : re-vérifier ne déplace pas la date', () => {
    const user = buildUser({ emailVerified: true });
    const first = user.emailVerifiedDate;

    user.markEmailAsVerified();

    expect(user.emailVerifiedDate).toBe(first);
  });

  it("vérifie d'emblée l'adresse d'un compte social", () => {
    const user = User.register({ ...registerProps, emailVerified: true });

    expect(user.isEmailVerified()).toBe(true);
    expect(user.emailVerifiedDate).toBeInstanceOf(Date);
  });

  it("publie la forme d'API attendue par le front", () => {
    const user = buildUser({ email: 'user@example.com', emailVerified: true });

    expect(user.toJSON().userEmail).toEqual({
      email: 'user@example.com',
      isVerified: true,
      verifiedDate: new Date('2026-01-01T00:00:00Z'),
    });
  });
});

describe('User — reprise d’une inscription inachevée', () => {
  const inachevee = () =>
    buildUser({ status: UserStatus.CREE, emailVerified: false });

  const reprise = {
    firstname: 'Camille',
    lastname: 'Durand',
    passwordHash: 'nouvelle-empreinte',
  };

  it('reconnaît un compte qui n’a jamais confirmé son adresse', () => {
    expect(inachevee().inscriptionInachevee()).toBe(true);
  });

  it('ne tient pas pour inachevée une inscription menée à son terme', () => {
    const verifie = buildUser({
      status: UserStatus.EMAIL_VERIFIE,
      emailVerified: true,
    });

    expect(verifie.inscriptionInachevee()).toBe(false);
  });

  it.each([UserStatus.SUSPENDU, UserStatus.CLOS, UserStatus.SUPPRIME])(
    'ne tient pas pour inachevé un compte %s, même non vérifié',
    (status) => {
      expect(
        buildUser({ status, emailVerified: false }).inscriptionInachevee(),
      ).toBe(false);
    },
  );

  it('redeclare l’identité de celui qui se présente', () => {
    const user = inachevee();

    user.reprendreInscription(reprise);

    expect(user.firstname).toBe('Camille');
    expect(user.toJSON().lastname).toBe('Durand');
  });

  it('garde l’identifiant du compte : c’est le même, pas un second', () => {
    const user = inachevee();
    const identifiant = user.userId;

    user.reprendreInscription(reprise);

    expect(user.userId).toBe(identifiant);
  });

  it('laisse l’adresse non vérifiée — la reprise ne prouve rien', () => {
    const user = inachevee();

    user.reprendreInscription(reprise);

    expect(user.isEmailVerified()).toBe(false);
    expect(user.status).toBe(UserStatus.CREE);
  });

  it('refuse de reprendre un compte dont l’adresse est vérifiée', () => {
    const verifie = buildUser({
      status: UserStatus.EMAIL_VERIFIE,
      emailVerified: true,
    });

    expect(() => verifie.reprendreInscription(reprise)).toThrow(
      EmailAlreadyRegisteredError,
    );
  });

  it('refuse de ressusciter un compte fermé', () => {
    const clos = buildUser({ status: UserStatus.CLOS, emailVerified: false });

    expect(() => clos.reprendreInscription(reprise)).toThrow(
      EmailAlreadyRegisteredError,
    );
  });

  it('ne change rien quand elle refuse', () => {
    const clos = buildUser({
      status: UserStatus.CLOS,
      emailVerified: false,
      firstname: 'Jean',
    });

    expect(() => clos.reprendreInscription(reprise)).toThrow();

    expect(clos.firstname).toBe('Jean');
  });
});

describe('User — du visiteur à l’investisseur', () => {
  it('ouvre un compte visiteur à l’inscription', () => {
    expect(User.register(registerProps).role).toBe(UserRole.VISITEUR);
  });

  it('promeut le visiteur dont le dossier vient d’être validé', () => {
    const visiteur = buildUser({ role: UserRole.VISITEUR });

    expect(visiteur.devenirInvestisseur()).toBe(true);
    expect(visiteur.role).toBe(UserRole.INVESTISSEUR);
  });

  it('n’écrit rien pour un investisseur déjà promu — la validation se rejoue', () => {
    const investisseur = buildUser({ role: UserRole.INVESTISSEUR });

    expect(investisseur.devenirInvestisseur()).toBe(false);
    expect(investisseur.role).toBe(UserRole.INVESTISSEUR);
  });

  /**
   * Un compte de back-office qui ferait valider un dossier à son nom ne doit
   * pas y perdre ses attributions, et un porteur ou un CGP n'a pas à devenir
   * investisseur parce qu'il a justifié de son identité.
   */
  it.each([
    UserRole.SUPER_ADMIN,
    UserRole.RCCI,
    UserRole.PORTEUR,
    UserRole.CGP,
  ])('ne déclasse pas un compte %s', (role) => {
    const compte = buildUser({ role });

    expect(compte.devenirInvestisseur()).toBe(false);
    expect(compte.role).toBe(role);
  });
});

describe('User — ouverture d’une session', () => {
  /** Comparateur de test : l'empreinte du fixture est `hashed-password`. */
  const compare = (clair: string, empreinte: string) =>
    Promise.resolve(`${clair}-password` === empreinte);

  const compte = (overrides = {}) =>
    buildUser({
      status: UserStatus.ACTIF,
      emailVerified: true,
      ...overrides,
    });

  it('laisse passer un compte en règle', async () => {
    await expect(
      compte().assertPeutOuvrirSession('hashed', compare),
    ).resolves.toBeUndefined();
  });

  it('refuse un mot de passe qui ne correspond pas', async () => {
    await expect(
      compte().assertPeutOuvrirSession('mauvais', compare),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('refuse un compte social, qui n’a pas de mot de passe', async () => {
    const social = compte({ passwordHash: null });

    await expect(
      social.assertPeutOuvrirSession('hashed', compare),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('refuse une adresse non vérifiée', async () => {
    const nonVerifie = compte({
      status: UserStatus.CREE,
      emailVerified: false,
    });

    await expect(
      nonVerifie.assertPeutOuvrirSession('hashed', compare),
    ).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('refuse un compte suspendu', async () => {
    await expect(
      compte({ status: UserStatus.SUSPENDU }).assertPeutOuvrirSession(
        'hashed',
        compare,
      ),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
  });

  it.each([UserStatus.CLOS, UserStatus.SUPPRIME])(
    'refuse un compte %s',
    async (status) => {
      await expect(
        compte({ status }).assertPeutOuvrirSession('hashed', compare),
      ).rejects.toBeInstanceOf(AccountClosedError);
    },
  );

  /**
   * L'ordre est une règle de sécurité, pas une préférence de lecture : les
   * trois causes qui suivent le mot de passe disent qu'un compte existe à
   * cette adresse et dans quel état il se trouve. Les éprouver avant
   * laisserait qui devine une adresse apprendre tout cela sans jamais
   * présenter d'identifiant valable.
   */
  describe('anti-énumération : le mot de passe est éprouvé en premier', () => {
    it.each([
      ['non vérifié', { status: UserStatus.CREE, emailVerified: false }],
      ['suspendu', { status: UserStatus.SUSPENDU }],
      ['clos', { status: UserStatus.CLOS }],
    ])(
      'ne trahit pas un compte %s quand le mot de passe est faux',
      async (_libelle, overrides) => {
        await expect(
          compte(overrides).assertPeutOuvrirSession('mauvais', compare),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
      },
    );
  });
});
