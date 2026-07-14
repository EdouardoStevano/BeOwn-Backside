import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import {
  TOKEN_SERVICE,
  type PasswordResetTokenPayload,
} from 'src/iam/domain/ports/token.service';
import { ACCOUNT_GATEWAY } from 'src/iam/domain/ports/account.gateway';
import {
  TWO_FACTOR_GATEWAY,
  TwoFactorMethod,
} from 'src/iam/domain/ports/two-factor.gateway';
import { CAPTCHA_VERIFIER } from 'src/iam/domain/ports/captcha.verifier';
import {
  ONE_TIME_TOKEN_STORE,
  OneTimeTokenPurpose,
} from 'src/iam/domain/ports/one-time-token.store';
import { SESSION_TOKEN_STORE } from 'src/iam/domain/ports/session-token.store';
import { OAUTH_HANDOFF_STORE } from 'src/iam/domain/ports/oauth-handoff.store';
import { AuthAccount } from 'src/iam/domain/models/auth-account';
import {
  AccountAlreadyExistsError,
  EmailDeliveryFailedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidOAuthCodeError,
  InvalidOrExpiredTokenError,
  InvalidOtpError,
  InvalidRefreshTokenError,
  InvalidTwoFactorChallengeError,
} from 'src/iam/domain/errors/iam.errors';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { TwoFactorChallengeService } from 'src/iam/application/two-factor/two-factor-challenge.service';

import { SignInHandler } from './sign-in.handler';
import { SignInCommand } from './sign-in.command';
import { VerifyTwoFactorSignInHandler } from './verify-two-factor-sign-in.handler';
import { VerifyTwoFactorSignInCommand } from './verify-two-factor-sign-in.command';
import { SignUpHandler } from './sign-up.handler';
import { SignUpCommand } from './sign-up.command';
import { RefreshTokenHandler } from './refresh-token.handler';
import { RefreshTokenCommand } from './refresh-token.command';
import { SocialAuthHandler } from './social-auth.handler';
import { SocialAuthCommand } from './social-auth.command';
import { ForgotPasswordHandler } from './forgot-password.handler';
import { ForgotPasswordCommand } from './forgot-password.command';
import { ResetPasswordHandler } from './reset-password.handler';
import { ResetPasswordCommand } from './reset-password.command';
import { ExchangeOAuthCodeHandler } from '../queries/exchange-oauth-code.handler';
import { ExchangeOAuthCodeQuery } from '../queries/exchange-oauth-code.query';

const TOKENS = { accessToken: 'at', refreshToken: 'rt' };

describe('authentication use cases', () => {
  let commandBus: CommandBus;
  let queryBus: QueryBus;

  const accounts = {
    findByEmail: jest.fn(),
    findBySocialId: jest.fn(),
    register: jest.fn(),
    registerSocial: jest.fn(),
    verifyPassword: jest.fn(),
    changePassword: jest.fn(),
    markEmailAsVerified: jest.fn(),
  };
  const tokenService = {
    generateTokens: jest.fn(),
    refreshTokens: jest.fn(),
    verifyAccessToken: jest.fn(),
    generateEmailToken: jest.fn(),
    verifyEmailToken: jest.fn(),
    generatePasswordResetToken: jest.fn(),
    verifyPasswordResetToken: jest.fn(),
    generateTwoFactorChallengeToken: jest.fn(),
    verifyTwoFactorChallengeToken: jest.fn(),
  };
  const twoFactor = {
    findActive: jest.fn(),
    findEnrollment: jest.fn(),
    startEnrollment: jest.fn(),
    activate: jest.fn(),
    disable: jest.fn(),
  };
  const challenges = { send: jest.fn(), verify: jest.fn() };
  const oneTimeTokens = {
    issue: jest.fn(),
    isPending: jest.fn(),
    consume: jest.fn(),
  };
  const sessions = {
    remember: jest.fn(),
    isCurrent: jest.fn(),
    invalidate: jest.fn(),
  };
  const handoff = { storeCode: jest.fn(), consumeCode: jest.fn() };
  const emailService = { sendPasswordResetEmail: jest.fn() };
  const captcha = { verify: jest.fn() };

  const verifiedAccount = new AuthAccount(
    1,
    'a@b.com',
    true,
    true,
    'investisseur',
  );

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        SignInHandler,
        VerifyTwoFactorSignInHandler,
        SignUpHandler,
        RefreshTokenHandler,
        SocialAuthHandler,
        ForgotPasswordHandler,
        ResetPasswordHandler,
        ExchangeOAuthCodeHandler,
        { provide: ACCOUNT_GATEWAY, useValue: accounts },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: TWO_FACTOR_GATEWAY, useValue: twoFactor },
        { provide: TwoFactorChallengeService, useValue: challenges },
        { provide: ONE_TIME_TOKEN_STORE, useValue: oneTimeTokens },
        { provide: SESSION_TOKEN_STORE, useValue: sessions },
        { provide: OAUTH_HANDOFF_STORE, useValue: handoff },
        { provide: EMAIL_SERVICE, useValue: emailService },
        { provide: CAPTCHA_VERIFIER, useValue: captcha },
        { provide: jwtConfig.KEY, useValue: { passwordResetTtl: 1800 } },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
    queryBus = moduleRef.get(QueryBus);
  });

  describe('SignInCommand', () => {
    it('issues tokens for valid credentials', async () => {
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      accounts.verifyPassword.mockResolvedValue(true);
      tokenService.generateTokens.mockResolvedValue(TOKENS);

      await expect(
        commandBus.execute(new SignInCommand('a@b.com', 'Secret123!')),
      ).resolves.toEqual(TOKENS);

      expect(tokenService.generateTokens).toHaveBeenCalledWith({
        sub: 1,
        email: 'a@b.com',
        role: 'investisseur',
      });
    });

    it('refuses to sign in an account whose email is not verified', async () => {
      accounts.findByEmail.mockResolvedValue(
        new AuthAccount(1, 'a@b.com', false, true),
      );

      await expect(
        commandBus.execute(new SignInCommand('a@b.com', 'Secret123!')),
      ).rejects.toThrow(EmailNotVerifiedError);

      // L'invariant est vérifié avant le mot de passe : inutile d'interroger Users.
      expect(accounts.verifyPassword).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      accounts.verifyPassword.mockResolvedValue(false);

      await expect(
        commandBus.execute(new SignInCommand('a@b.com', 'wrong')),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('gives an unknown email the same answer as a wrong password', async () => {
      accounts.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(new SignInCommand('ghost@b.com', 'Secret123!')),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('never handles a password hash itself', async () => {
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      accounts.verifyPassword.mockResolvedValue(true);
      tokenService.generateTokens.mockResolvedValue(TOKENS);

      await commandBus.execute(new SignInCommand('a@b.com', 'Secret123!'));

      // La vérification est déléguée au contexte propriétaire du secret.
      expect(accounts.verifyPassword).toHaveBeenCalledWith(
        'a@b.com',
        'Secret123!',
      );
    });
  });

  describe('SignInCommand — second facteur actif', () => {
    const totpEnrollment = {
      method: TwoFactorMethod.TOTP,
      credential: 'SECRET',
      isActive: true,
    };

    beforeEach(() => {
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      accounts.verifyPassword.mockResolvedValue(true);
      twoFactor.findActive.mockResolvedValue(totpEnrollment);
      tokenService.generateTwoFactorChallengeToken.mockResolvedValue('chal');
    });

    it('issues a challenge instead of tokens', async () => {
      const result = await commandBus.execute(
        new SignInCommand('a@b.com', 'Secret123!'),
      );

      expect(result).toEqual({
        mfaRequired: true,
        method: TwoFactorMethod.TOTP,
        challengeToken: 'chal',
      });
      // Le mot de passe seul ne vaut pas une session.
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('remembers the challenge id, so it can only be played once', async () => {
      await commandBus.execute(new SignInCommand('a@b.com', 'Secret123!'));

      const [payload] = tokenService.generateTwoFactorChallengeToken.mock
        .calls[0] as [{ challengeId: string }];
      expect(oneTimeTokens.issue).toHaveBeenCalledWith(
        OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE,
        'a@b.com',
        payload.challengeId,
      );
    });

    it('sends the code on the enrolled channel', async () => {
      await commandBus.execute(new SignInCommand('a@b.com', 'Secret123!'));

      expect(challenges.send).toHaveBeenCalledWith('a@b.com', totpEnrollment);
    });

    it('still refuses a wrong password before reaching the second factor', async () => {
      accounts.verifyPassword.mockResolvedValue(false);

      await expect(
        commandBus.execute(new SignInCommand('a@b.com', 'wrong')),
      ).rejects.toThrow(InvalidCredentialsError);
      expect(challenges.send).not.toHaveBeenCalled();
    });
  });

  describe('VerifyTwoFactorSignInCommand', () => {
    const payload = { sub: 1, email: 'a@b.com', challengeId: 'cid' };
    const enrollment = {
      method: TwoFactorMethod.TOTP,
      credential: 'SECRET',
      isActive: true,
    };

    beforeEach(() => {
      tokenService.verifyTwoFactorChallengeToken.mockResolvedValue(payload);
      oneTimeTokens.isPending.mockResolvedValue(true);
      twoFactor.findActive.mockResolvedValue(enrollment);
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      tokenService.generateTokens.mockResolvedValue(TOKENS);
    });

    it('issues the tokens once the code is verified, and burns the challenge', async () => {
      challenges.verify.mockResolvedValue(true);

      await expect(
        commandBus.execute(new VerifyTwoFactorSignInCommand('chal', '123456')),
      ).resolves.toEqual(TOKENS);

      expect(challenges.verify).toHaveBeenCalledWith(
        'a@b.com',
        enrollment,
        '123456',
      );
      expect(oneTimeTokens.consume).toHaveBeenCalledWith(
        OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE,
        'a@b.com',
      );
    });

    it('rejects a wrong code without burning the challenge', async () => {
      challenges.verify.mockResolvedValue(false);

      await expect(
        commandBus.execute(new VerifyTwoFactorSignInCommand('chal', '000000')),
      ).rejects.toThrow(InvalidOtpError);

      // Une faute de frappe ne doit pas obliger à ressaisir son mot de passe :
      // c'est l'OtpService qui compte les tentatives.
      expect(oneTimeTokens.consume).not.toHaveBeenCalled();
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('rejects a challenge already consumed (replay)', async () => {
      oneTimeTokens.isPending.mockResolvedValue(false);

      await expect(
        commandBus.execute(new VerifyTwoFactorSignInCommand('chal', '123456')),
      ).rejects.toThrow(InvalidTwoFactorChallengeError);
      expect(challenges.verify).not.toHaveBeenCalled();
    });

    it('rejects a token that is not a challenge token', async () => {
      tokenService.verifyTwoFactorChallengeToken.mockRejectedValue(
        new Error('not a challenge'),
      );

      await expect(
        commandBus.execute(
          new VerifyTwoFactorSignInCommand('access-token', '123456'),
        ),
      ).rejects.toThrow(InvalidTwoFactorChallengeError);
    });

    it('refuses to finish if the 2FA was disabled in between', async () => {
      twoFactor.findActive.mockResolvedValue(null);

      await expect(
        commandBus.execute(new VerifyTwoFactorSignInCommand('chal', '123456')),
      ).rejects.toThrow(InvalidTwoFactorChallengeError);
    });
  });

  describe('SignUpCommand', () => {
    it('verifies the captcha before creating the account', async () => {
      const order: string[] = [];
      captcha.verify.mockImplementation(() => {
        order.push('captcha');
        return Promise.resolve();
      });
      accounts.register.mockImplementation(() => {
        order.push('register');
        return Promise.resolve({ userId: 7 });
      });

      await expect(
        commandBus.execute(
          new SignUpCommand('Jean', null, 'a@b.com', 'Secret123!', 'tok'),
        ),
      ).resolves.toEqual({ userId: 7 });

      expect(order).toEqual(['captcha', 'register']);
      expect(captcha.verify).toHaveBeenCalledWith('tok');
    });

    it('does not create an account when the captcha fails', async () => {
      captcha.verify.mockRejectedValue(new Error('bot'));

      await expect(
        commandBus.execute(
          new SignUpCommand('Jean', null, 'a@b.com', 'Secret123!', 'bad'),
        ),
      ).rejects.toThrow();
      expect(accounts.register).not.toHaveBeenCalled();
    });
  });

  describe('RefreshTokenCommand', () => {
    it('returns rotated tokens', async () => {
      tokenService.refreshTokens.mockResolvedValue(TOKENS);

      await expect(
        commandBus.execute(new RefreshTokenCommand('old-rt')),
      ).resolves.toEqual(TOKENS);
      expect(tokenService.refreshTokens).toHaveBeenCalledWith('old-rt');
    });

    it('maps any failure to an invalid-refresh-token error', async () => {
      tokenService.refreshTokens.mockRejectedValue(new Error('expired'));

      await expect(
        commandBus.execute(new RefreshTokenCommand('bad')),
      ).rejects.toThrow(InvalidRefreshTokenError);
    });
  });

  describe('SocialAuthCommand', () => {
    const social = { email: 'a@b.com', firstname: 'Jean', socialId: 'goog-1' };

    it('signs in an existing social account and returns a handoff code', async () => {
      accounts.findBySocialId.mockResolvedValue(verifiedAccount);
      tokenService.generateTokens.mockResolvedValue(TOKENS);

      const result = await commandBus.execute(new SocialAuthCommand(social));

      expect(result.isNewUser).toBe(false);
      expect(result.code).toEqual(expect.any(String));
      // Les tokens ne partent pas dans l'URL : ils restent derrière le code.
      expect(handoff.storeCode).toHaveBeenCalledWith(result.code, TOKENS);
    });

    it('verifies the email of an existing account left unverified', async () => {
      accounts.findBySocialId.mockResolvedValue(
        new AuthAccount(1, 'a@b.com', false, false),
      );
      tokenService.generateTokens.mockResolvedValue(TOKENS);

      await commandBus.execute(new SocialAuthCommand(social));

      expect(accounts.markEmailAsVerified).toHaveBeenCalledWith('a@b.com');
    });

    it('creates an account when the social id is unknown', async () => {
      accounts.findBySocialId.mockResolvedValue(null);
      accounts.registerSocial.mockResolvedValue(verifiedAccount);
      tokenService.generateTokens.mockResolvedValue(TOKENS);

      const result = await commandBus.execute(new SocialAuthCommand(social));

      expect(result.isNewUser).toBe(true);
      expect(accounts.registerSocial).toHaveBeenCalledWith({
        firstname: 'Jean',
        lastname: null,
        email: 'a@b.com',
        socialId: 'goog-1',
      });
    });

    it('surfaces a conflict when the email already belongs to another account', async () => {
      accounts.findBySocialId.mockResolvedValue(null);
      // La violation d'unicité est traduite en erreur de domaine par l'ACL,
      // le handler ne connaît aucun code d'erreur PostgreSQL.
      accounts.registerSocial.mockRejectedValue(
        new AccountAlreadyExistsError(),
      );

      await expect(
        commandBus.execute(new SocialAuthCommand(social)),
      ).rejects.toThrow(AccountAlreadyExistsError);
    });
  });

  describe('ExchangeOAuthCodeQuery', () => {
    it('exchanges a code for its tokens', async () => {
      handoff.consumeCode.mockResolvedValue(TOKENS);

      await expect(
        queryBus.execute(new ExchangeOAuthCodeQuery('code-1')),
      ).resolves.toEqual(TOKENS);
    });

    it('rejects a code already consumed or expired', async () => {
      handoff.consumeCode.mockResolvedValue(null);

      await expect(
        queryBus.execute(new ExchangeOAuthCodeQuery('code-1')),
      ).rejects.toThrow(InvalidOAuthCodeError);
    });
  });

  describe('ForgotPasswordCommand', () => {
    it('sends a single-use reset link, storing its id for later consumption', async () => {
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      tokenService.generatePasswordResetToken.mockResolvedValue('reset-token');

      await commandBus.execute(new ForgotPasswordCommand('a@b.com'));

      const [payload] = tokenService.generatePasswordResetToken.mock
        .calls[0] as [PasswordResetTokenPayload];
      const { resetTokenId } = payload;
      expect(oneTimeTokens.issue).toHaveBeenCalledWith(
        OneTimeTokenPurpose.PASSWORD_RESET,
        'a@b.com',
        resetTokenId,
      );

      // Le libellé de durée est dérivé du TTL réel du token.
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@b.com',
        'reset-token',
        '30 minutes',
      );
    });

    it('no-ops for an unknown email (no user enumeration)', async () => {
      accounts.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(new ForgotPasswordCommand('ghost@b.com')),
      ).resolves.toBeUndefined();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('surfaces a failure of the email provider', async () => {
      accounts.findByEmail.mockResolvedValue(verifiedAccount);
      tokenService.generatePasswordResetToken.mockResolvedValue('reset-token');
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('smtp'));

      await expect(
        commandBus.execute(new ForgotPasswordCommand('a@b.com')),
      ).rejects.toThrow(EmailDeliveryFailedError);
    });
  });

  describe('ResetPasswordCommand', () => {
    const validPayload = { sub: 9, email: 'a@b.com', resetTokenId: 'rid' };

    it('changes the password, burns the link and revokes open sessions', async () => {
      tokenService.verifyPasswordResetToken.mockResolvedValue(validPayload);
      oneTimeTokens.isPending.mockResolvedValue(true);

      await commandBus.execute(new ResetPasswordCommand('tok', 'NewPass123!'));

      // Le hachage appartient au contexte Users : IAM passe le mot de passe en clair.
      expect(accounts.changePassword).toHaveBeenCalledWith(
        'a@b.com',
        'NewPass123!',
      );
      expect(oneTimeTokens.consume).toHaveBeenCalledWith(
        OneTimeTokenPurpose.PASSWORD_RESET,
        'a@b.com',
      );
      expect(sessions.invalidate).toHaveBeenCalledWith('a@b.com');
    });

    it('burns the link before writing, so two concurrent resets cannot both pass', async () => {
      tokenService.verifyPasswordResetToken.mockResolvedValue(validPayload);
      oneTimeTokens.isPending.mockResolvedValue(true);

      const order: string[] = [];
      oneTimeTokens.consume.mockImplementation(() => {
        order.push('consume');
        return Promise.resolve();
      });
      accounts.changePassword.mockImplementation(() => {
        order.push('change');
        return Promise.resolve();
      });

      await commandBus.execute(new ResetPasswordCommand('tok', 'NewPass123!'));

      expect(order).toEqual(['consume', 'change']);
    });

    it('rejects a link already used once (replay)', async () => {
      tokenService.verifyPasswordResetToken.mockResolvedValue(validPayload);
      // Le tokenId n'est plus en attente : il a été consommé par un premier reset.
      oneTimeTokens.isPending.mockResolvedValue(false);

      await expect(
        commandBus.execute(new ResetPasswordCommand('tok', 'NewPass123!')),
      ).rejects.toThrow(InvalidOrExpiredTokenError);
      expect(accounts.changePassword).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      tokenService.verifyPasswordResetToken.mockRejectedValue(new Error('bad'));

      await expect(
        commandBus.execute(new ResetPasswordCommand('bad', 'NewPass123!')),
      ).rejects.toThrow(InvalidOrExpiredTokenError);
    });
  });
});
