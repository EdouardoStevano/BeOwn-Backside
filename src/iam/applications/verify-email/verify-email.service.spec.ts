import { MailerService } from '@nestjs-modules/mailer';
import { VerifyEmailService } from './verify-email.service';
import type { CacheManagerService } from '../../domains/ports/cahe-manager.service';
import type { TokenService } from '../../domains/ports/token.service';
import type { UserRepository } from 'src/users/applications/ports/repositories/user.repository';

describe('VerifyEmailService', () => {
  let service: VerifyEmailService;

  beforeEach(() => {
    service = new VerifyEmailService(
      {} as TokenService,
      {} as UserRepository,
      {} as CacheManagerService,
      {} as MailerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
