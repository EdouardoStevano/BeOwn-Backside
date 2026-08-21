import { UnauthorizedException } from '@nestjs/common';
import { VerifyTwoFactorUseCase } from './verify-two-factor.usecase';
import { UserStatus } from 'src/users/domains/user';

/**
 * Échange du jeton pré-authentifié contre de vrais tokens.
 *
 * Seul chemin d'émission d'un access token pour un compte 2FA-activée : si un
 * de ces cas se met à délivrer des tokens sans code valide, la faille d'origine
 * est de retour.
 */
describe('VerifyTwoFactorUseCase', () => {
    let usecase: VerifyTwoFactorUseCase;
    let tokenService: any;
    let usersRepository: any;
    let emailOtp: any;
    let totp: any;

    const PRE_AUTH = { sub: 42, email: 'user@example.com', type: 'pre_auth' };

    beforeEach(() => {
        tokenService = {
            verifyPreAuthToken: jest.fn().mockResolvedValue(PRE_AUTH),
            generateTokens: jest.fn().mockResolvedValue({
                accessToken: 'access',
                refreshToken: 'refresh',
            }),
        };
        usersRepository = {
            findById: jest.fn().mockResolvedValue({
                userId: 42,
                role: 'investisseur',
                status: UserStatus.ACTIF,
            }),
        };
        emailOtp = {
            send: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn().mockResolvedValue(true),
        };
        totp = { verify: jest.fn().mockResolvedValue(true) };

        usecase = new VerifyTwoFactorUseCase(
            tokenService,
            usersRepository,
            emailOtp,
            totp,
        );
    });

    describe('code valide', () => {
        it('délivre les tokens (méthode email par défaut)', async () => {
            const res = await usecase.verify({
                preAuthToken: 'pre',
                otp: '123456',
            });

            expect(emailOtp.verify).toHaveBeenCalledWith({
                email: 'user@example.com',
                otp: '123456',
            });
            expect(res).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
        });

        it('accepte la méthode TOTP', async () => {
            await usecase.verify({
                preAuthToken: 'pre',
                otp: '654321',
                method: 'totp',
            });

            expect(totp.verify).toHaveBeenCalledWith(42, { otp: '654321' });
            expect(emailOtp.verify).not.toHaveBeenCalled();
        });
    });

    describe('refus', () => {
        it('rejette un code erroné sans délivrer de token', async () => {
            emailOtp.verify.mockResolvedValue(false);

            await expect(
                usecase.verify({ preAuthToken: 'pre', otp: '000000' }),
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(tokenService.generateTokens).not.toHaveBeenCalled();
        });

        it('rejette un jeton pré-auth invalide ou expiré', async () => {
            tokenService.verifyPreAuthToken.mockRejectedValue(new Error('expired'));

            await expect(
                usecase.verify({ preAuthToken: 'pourri', otp: '123456' }),
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(emailOtp.verify).not.toHaveBeenCalled();
            expect(tokenService.generateTokens).not.toHaveBeenCalled();
        });

        it.each([UserStatus.SUSPENDU, UserStatus.CLOS, UserStatus.SUPPRIME])(
            'refuse un compte %s même avec un code valide',
            async (status) => {
                usersRepository.findById.mockResolvedValue({
                    userId: 42,
                    role: 'investisseur',
                    status,
                });

                await expect(
                    usecase.verify({ preAuthToken: 'pre', otp: '123456' }),
                ).rejects.toBeInstanceOf(UnauthorizedException);
                expect(tokenService.generateTokens).not.toHaveBeenCalled();
            },
        );

        it('refuse si l’utilisateur a disparu entre-temps', async () => {
            usersRepository.findById.mockResolvedValue(null);

            await expect(
                usecase.verify({ preAuthToken: 'pre', otp: '123456' }),
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(tokenService.generateTokens).not.toHaveBeenCalled();
        });
    });

    describe('envoi du code', () => {
        it('envoie à l’adresse portée par le jeton, pas à une adresse fournie', async () => {
            await usecase.sendCode({ preAuthToken: 'pre' });

            expect(emailOtp.send).toHaveBeenCalledWith({
                email: 'user@example.com',
            });
        });

        it('refuse un jeton invalide', async () => {
            tokenService.verifyPreAuthToken.mockRejectedValue(new Error('nope'));

            await expect(
                usecase.sendCode({ preAuthToken: 'pourri' }),
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(emailOtp.send).not.toHaveBeenCalled();
        });
    });
});