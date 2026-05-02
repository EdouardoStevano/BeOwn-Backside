import { Test, TestingModule } from '@nestjs/testing';
import { VerifyEmailController } from './verify-email.controller';

describe('VerifyEmailController', () => {
  let controller: VerifyEmailController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerifyEmailController],
    }).compile();

    controller = module.get<VerifyEmailController>(VerifyEmailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
