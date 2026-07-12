import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { ConflictException } from '@nestjs/common';
import { USER_REPOSITORY } from '../ports/repositories/user.repository';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { RegisterHandler } from './register.handler';
import { RegisterCommand } from './register.command';

describe('RegisterCommand via CommandBus', () => {
  let commandBus: CommandBus;

  const userRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
  };
  const userFactory = { create: jest.fn() };
  const notificationEvents = { userRegistered: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        RegisterHandler,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: UserFactory, useValue: userFactory },
        { provide: NotificationEventService, useValue: notificationEvents },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  it('creates the user and emits the registration event', async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    const created = { userId: 7 };
    userFactory.create.mockResolvedValue(created);
    userRepository.save.mockResolvedValue({ userId: 7 });
    const fullUser = { userId: 7, userEmail: { email: 'ada@b.com' } };
    userRepository.findById.mockResolvedValue(fullUser);

    const result = await commandBus.execute(
      new RegisterCommand('Ada', null, 'ada@b.com', 'Secret123'),
    );

    expect(userFactory.create).toHaveBeenCalledWith({
      firstname: 'Ada',
      lastname: null,
      email: 'ada@b.com',
      password: 'Secret123',
      socialId: null,
    });
    expect(userRepository.save).toHaveBeenCalledWith(created);
    expect(notificationEvents.userRegistered).toHaveBeenCalledWith(fullUser);
    expect(result).toEqual({ userId: 7 });
  });

  it('rejects an email that already exists', async () => {
    userRepository.findByEmail.mockResolvedValue({ userId: 1 });

    await expect(
      commandBus.execute(
        new RegisterCommand('Ada', null, 'ada@b.com', 'Secret123'),
      ),
    ).rejects.toThrow(ConflictException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
