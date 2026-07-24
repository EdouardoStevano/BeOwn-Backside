import { BcryptService } from './bcrypt.service';
import { HashingService } from './hashing.service';

describe('HashingService', () => {
  let service: HashingService;

  beforeEach(() => {
    service = new BcryptService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
