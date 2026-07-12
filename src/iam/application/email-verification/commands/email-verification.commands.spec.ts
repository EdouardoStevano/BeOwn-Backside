import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { TOKEN_SERVICE } from 'src/iam/domain/ports/token.service';
import { ACCOUNT_GATEWAY } from 'src/iam/domain/ports/account.gateway';
import {
  ONE_TIME_TOKEN_STORE,
  OneTimeTokenPurpose,
} from 'src/iam/domain/ports/one-time-token.store';
import { AuthAccount } from 'src/iam/domain/models/auth-account';
import {
  AccountNotFoundError,
  EmailAlreadyVerifiedError,
  InvalidEmailVerificationTokenError,
} from 'src/iam/domain/errors/iam.errors';
import appUrlsConfig from 'src/iam/infrastructure/config/app-urls.config';

import { SendVerificationLinkHandler } from './send-verification-link.handler';
import { SendVerificationLinkCommand } from './send-verification-link.command';
import { ConfirmEmailHandler } from './confirm-email.handler';
import { ConfirmEmailCommand } from './confirm-email.command';

describe('email verification use cases', () => {
  let commandBus: CommandBus;

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
    generateEmailToken: jest.fn(),
    verifyEmailToken: jest.fn(),
  };
  const oneTimeTokens = {
    issue: jest.fn(),
    isPending: jest.fn(),
    consume: jest.fn(),
  };
  const emailService = { sendEmailVerificationLink: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        SendVerificationLinkHandler,
        ConfirmEmailHandler,
        { provide: ACCOUNT_GATEWAY, useValue: accounts },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: ONE_TIME_TOKEN_STORE, useValue: oneTimeTokens },
        { provide: EMAIL_SERVICE, useValue: emailService },
        {
          provide: appUrlsConfig.KEY,
          useValue: { api: 'https://api.test', frontend: 'https://app.test' },
        },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  describe('SendVerificationLinkCommand', () => {
    it('emails a link built from the configured API url', async () => {
      accounts.findByEmail.mockResolvedValue(
        new AuthAccount(1, 'a@b.com', false, true),
      );
      tokenService.generateEmailToken.mockResolvedValue('tok');

      await commandBus.execute(new SendVerificationLinkCommand('a@b.com'));

      expect(emailService.sendEmailVerificationLink).toHaveBeenCalledWith(
        'a@b.com',
        'https://api.test/email/verify?token=tok',
      );
      expect(oneTimeTokens.issue).toHaveBeenCalledWith(
        OneTimeTokenPurpose.EMAIL_VERIFICATION,
        'a@b.com',
        expect.any(String),
      );
    });

    it('rejects an account already verified', async () => {
      accounts.findByEmail.mockResolvedValue(
        new AuthAccount(1, 'a@b.com', true, true),
      );

      await expect(
        commandBus.execute(new SendVerificationLinkCommand('a@b.com')),
      ).rejects.toThrow(EmailAlreadyVerifiedError);
    });

    it('rejects an unknown account', async () => {
      accounts.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(new SendVerificationLinkCommand('ghost@b.com')),
      ).rejects.toThrow(AccountNotFoundError);
    });
  });

  describe('ConfirmEmailCommand', () => {
    const payload = { sub: 1, email: 'a@b.com', emailTokenId: 'tid' };

    it('marks the email as verified and burns the link', async () => {
      tokenService.verifyEmailToken.mockResolvedValue(payload);
      oneTimeTokens.isPending.mockResolvedValue(true);

      await expect(
        commandBus.execute(new ConfirmEmailCommand('tok')),
      ).resolves.toBe('a@b.com');

      expect(accounts.markEmailAsVerified).toHaveBeenCalledWith('a@b.com');
      expect(oneTimeTokens.consume).toHaveBeenCalledWith(
        OneTimeTokenPurpose.EMAIL_VERIFICATION,
        'a@b.com',
      );
    });

    it('rejects a link already consumed', async () => {
      tokenService.verifyEmailToken.mockResolvedValue(payload);
      oneTimeTokens.isPending.mockResolvedValue(false);

      await expect(
        commandBus.execute(new ConfirmEmailCommand('tok')),
      ).rejects.toThrow(InvalidEmailVerificationTokenError);
      expect(accounts.markEmailAsVerified).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      tokenService.verifyEmailToken.mockRejectedValue(new Error('bad'));

      await expect(
        commandBus.execute(new ConfirmEmailCommand('bad')),
      ).rejects.toThrow(InvalidEmailVerificationTokenError);
    });
  });
});
