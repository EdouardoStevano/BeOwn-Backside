import { Test, TestingModule } from '@nestjs/testing';
import { MailVerificationService } from './mail-verification.service';

describe('MailVerificationService', () => {
  let service: MailVerificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailVerificationService],
    }).compile();

    service = module.get<MailVerificationService>(MailVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
