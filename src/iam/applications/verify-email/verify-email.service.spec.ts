import { Test, TestingModule } from '@nestjs/testing';
import { VerifyEmailService } from './verify-email.service';

describe('VerifyEmailService', () => {
  let service: VerifyEmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VerifyEmailService],
    }).compile();

    service = module.get<VerifyEmailService>(VerifyEmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
