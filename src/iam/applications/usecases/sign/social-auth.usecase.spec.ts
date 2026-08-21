import { SocialAuthUseCase } from './social-auth.usecase';

/**
 * Authentification sociale (Google / LinkedIn).
 *
 * Le fournisseur a déjà vérifié l'adresse : le compte doit donc naître, ou
 * devenir, « email vérifié ». Un ancien défaut laissait le statut à sa valeur
 * par défaut CREE — un compte Google s'affichait « Email non vérifié » côté
 * Admin et restait bloqué au premier palier du cycle de vie.
 *
 * Spec réécrite après la refonte hexagonale IAM : le modèle de domaine est
 * désormais riche (`isEmailVerified()` / `markEmailAsVerified()` / `toJSON()`)
 * et le use case relit le facteur MFA actif. L'invariant testé, lui, est
 * inchangé.
 */
describe('SocialAuthUseCase — email vérifié automatiquement', () => {
  let usecase: SocialAuthUseCase;
  let usersRepository: any;
  let userFactory: any;
  let tokenService: any;
  let mfaFactors: any;

  const social = {
    socialId: 'google-123',
    email: 'jane@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
  } as any;

  /** Utilisateur de domaine minimal, avec les méthodes que le use case appelle. */
  const makeUser = (over: Partial<any> = {}) => {
    const user: any = {
      userId: 42,
      email: 'jane@example.com',
      role: 'investisseur',
      emailVerified: false,
      isEmailVerified() {
        return this.emailVerified;
      },
      markEmailAsVerified() {
        this.emailVerified = true;
      },
      toJSON: jest.fn(function (this: any) {
        return { userId: this.userId, email: this.email };
      }),
      ...over,
    };
    return user;
  };

  beforeEach(() => {
    usersRepository = {
      findOneBySocialId: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn((u: any) => Promise.resolve(u)),
    };
    userFactory = { create: jest.fn().mockResolvedValue(makeUser({ userId: 99 })) };
    tokenService = {
      generateTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
    };
    mfaFactors = { findActiveMethod: jest.fn().mockResolvedValue(null) };

    usecase = new SocialAuthUseCase(
      tokenService,
      usersRepository,
      userFactory,
      mfaFactors,
    );
  });

  describe('création d\'un nouveau compte social', () => {
    it('demande un email déjà vérifié à la fabrique', async () => {
      await usecase.authenticate(social);

      expect(userFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: social.email,
          socialId: social.socialId,
          emailVerified: true,
          // Compte social : aucun mot de passe local.
          password: null,
        }),
      );
    });

    it('signale un nouvel utilisateur et délivre des tokens', async () => {
      const res: any = await usecase.authenticate(social);

      expect(res.isNewUser).toBe(true);
      expect(res.accessToken).toBe('at');
      expect(res.refreshToken).toBe('rt');
    });
  });

  describe('compte social existant', () => {
    it('vérifie l\'email s\'il ne l\'était pas encore, et persiste', async () => {
      const existing = makeUser({ emailVerified: false });
      usersRepository.findOneBySocialId.mockResolvedValue(existing);

      const res: any = await usecase.authenticate(social);

      expect(existing.isEmailVerified()).toBe(true);
      expect(usersRepository.update).toHaveBeenCalledWith(existing);
      expect(res.isNewUser).toBe(false);
    });

    it('n\'écrit rien quand l\'email est déjà vérifié', async () => {
      const existing = makeUser({ emailVerified: true });
      usersRepository.findOneBySocialId.mockResolvedValue(existing);

      await usecase.authenticate(social);

      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('reflète l\'état MFA réel du compte sans exiger de second facteur', async () => {
      const existing = makeUser({ emailVerified: true });
      usersRepository.findOneBySocialId.mockResolvedValue(existing);
      mfaFactors.findActiveMethod.mockResolvedValue('totp');

      const res: any = await usecase.authenticate(social);

      // Le fournisseur a déjà authentifié le porteur : la session est complète,
      // l'état MFA est publié mais pas opposé.
      expect(existing.toJSON).toHaveBeenCalledWith({
        enabled: true,
        method: 'totp',
      });
      expect(res.accessToken).toBe('at');
    });
  });
});
