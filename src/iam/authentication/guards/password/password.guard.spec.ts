import { PasswordGuard } from './password.guard';

describe('PasswordGuard', () => {
  it('should be defined', () => {
    expect(new PasswordGuard()).toBeDefined();
  });
});
