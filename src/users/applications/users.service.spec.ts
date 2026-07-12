import { CommandBus } from '@nestjs/cqrs';
import { UsersService } from './users.service';
import { RegisterCommand } from './commands/register.command';
import type { RegisterDto } from '../presenters/dto/user.dto';

describe('UsersService', () => {
  let service: UsersService;
  const commandBus = { execute: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsersService(commandBus as unknown as CommandBus);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('dispatches a RegisterCommand', async () => {
    await service.create({
      firstname: 'Ada',
      email: 'ada@b.com',
      password: 'Secret123',
    } as RegisterDto);

    expect(commandBus.execute).toHaveBeenCalledWith(
      new RegisterCommand('Ada', null, 'ada@b.com', 'Secret123'),
    );
  });
});
