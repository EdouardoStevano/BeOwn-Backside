import { SocialAuthUseCase } from './social-auth.usecase';
// Ré-export du domaine : la couche applicative ne dépend pas de l'infrastructure.
import { UserStatus } from 'src/users/domains/user';

/**
 * Authentification sociale (Google / LinkedIn).
 *
 * Le fournisseur a déjà vérifié l'adresse : le compte doit donc naître avec un
 * email vérifié ET le statut de cycle de vie correspondant. Jusqu'ici seul
 * `userEmail.verify()` était appelé — le statut restait à sa valeur par défaut
 * CREE, si bien qu'un compte Google s'affichait « Email non vérifié » côté
 * Admin et restait bloqué au premier palier du cycle de vie.
 *
 * Garde-fou : on ne fait qu'avancer CREE → EMAIL_VERIFIE. Un statut plus
 * avancé (ACTIF) ou terminal (SUSPENDU, SUPPRIME) n'est jamais réécrit.
 */
describe('SocialAuthUseCase — email vérifié automatiquement', () => {
    let usecase: SocialAuthUseCase;
    let usersRepository: any;
    let userFactory: any;
    let tokenService: any;

    const social = {
        socialId: 'google-123',
        email: 'jane@example.com',
        firstname: 'Jane',
        lastname: 'Doe',
    } as any;

    /** Utilisateur de domaine minimal, avec le VO userEmail attendu. */
    const makeUser = (over: Partial<any> = {}) => ({
        userId: 42,
        role: 'investisseur',
        status: UserStatus.CREE,
        userEmail: {
            email: 'jane@example.com',
            isVerified: false,
            verify() {
                this.isVerified = true;
            },
        },
        ...over,
    });

    beforeEach(() => {
        usersRepository = {
            findOneBySocialId: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue(undefined),
            save: jest.fn((u: any) => Promise.resolve({ ...u, userId: 99 })),
        };
        userFactory = { create: jest.fn() };
        tokenService = {
            generateTokens: jest.fn().mockResolvedValue({
                accessToken: 'at',
                refreshToken: 'rt',
            }),
        };

        usecase = new SocialAuthUseCase(tokenService, usersRepository, userFactory);
    });

    describe('création d’un nouveau compte social', () => {
        it('demande un email vérifié à la fabrique', async () => {
            userFactory.create.mockResolvedValue(
                makeUser({ userId: undefined, status: undefined }),
            );

            await usecase.authenticate(social);

            expect(userFactory.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'jane@example.com',
                    socialId: 'google-123',
                    emailVerified: true,
                }),
            );
        });

        it('persiste le compte avec le statut EMAIL_VERIFIE', async () => {
            userFactory.create.mockResolvedValue(
                makeUser({ userId: undefined, status: undefined }),
            );

            const res = await usecase.authenticate(social);

            expect(usersRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ status: UserStatus.EMAIL_VERIFIE }),
            );
            expect(res.isNewUser).toBe(true);
        });
    });

    describe('compte social existant', () => {
        it('rattrape un compte resté CREE', async () => {
            const existing = makeUser({ status: UserStatus.CREE });
            usersRepository.findOneBySocialId.mockResolvedValue(existing);

            await usecase.authenticate(social);

            expect(existing.status).toBe(UserStatus.EMAIL_VERIFIE);
            expect(existing.userEmail.isVerified).toBe(true);
            expect(usersRepository.update).toHaveBeenCalledWith(existing);
        });

        it('ne rétrograde pas un compte déjà ACTIF', async () => {
            const existing = makeUser({
                status: UserStatus.ACTIF,
                userEmail: {
                    email: 'jane@example.com',
                    isVerified: true,
                    verify() {
                        this.isVerified = true;
                    },
                },
            });
            usersRepository.findOneBySocialId.mockResolvedValue(existing);

            await usecase.authenticate(social);

            expect(existing.status).toBe(UserStatus.ACTIF);
        });

        it('ne réécrit pas le statut d’un compte suspendu', async () => {
            const existing = makeUser({ status: UserStatus.SUSPENDU });
            usersRepository.findOneBySocialId.mockResolvedValue(existing);

            await usecase.authenticate(social);

            expect(existing.status).toBe(UserStatus.SUSPENDU);
        });

        it('renvoie isNewUser=false et des jetons', async () => {
            usersRepository.findOneBySocialId.mockResolvedValue(makeUser());

            const res = await usecase.authenticate(social);

            expect(res).toEqual({
                accessToken: 'at',
                refreshToken: 'rt',
                isNewUser: false,
            });
        });
    });
});
