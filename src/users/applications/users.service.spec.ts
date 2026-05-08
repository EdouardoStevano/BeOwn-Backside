import { UsersService } from './users.service';
import { RegisterUseCase } from './usecases/register.usecase';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService({
      execute: jest.fn(),
    } as unknown as RegisterUseCase);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
