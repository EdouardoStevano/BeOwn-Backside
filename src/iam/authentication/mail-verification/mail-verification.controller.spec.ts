import { Test, TestingModule } from '@nestjs/testing';
import { MailVerificationController } from './mail-verification.controller';

describe('MailVerificationController', () => {
  let controller: MailVerificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailVerificationController],
    }).compile();

    controller = module.get<MailVerificationController>(MailVerificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
