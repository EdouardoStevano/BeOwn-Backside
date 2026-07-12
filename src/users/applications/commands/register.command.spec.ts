import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { USER_REPOSITORY } from '../ports/repositories/user.repository';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { EmailAlreadyInUseError } from 'src/users/domains/errors/user.errors';
import { User } from 'src/users/domains/user';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';
import { UserRole, UserStatus } from 'src/users/domains/enums/user.enum';
import { UsersAccountService } from '../services/user-account.service';
import { RegisterHandler } from './register.handler';
import { RegisterCommand } from './register.command';

const savedUser = (): User => {
  const user = new User();
  user.userId = 1;
  user.firstname = 'Ada';
  user.lastname = null;
  user.socialId = null;
  user.role = UserRole.INVESTISSEUR;
  user.status = UserStatus.CREE;
  user.userType = null;
  user.userEmail = UserEmail.create('ada@b.com');
  user.tfaMethods = [];
  return user;
};

describe('RegisterCommand via CommandBus', () => {
  let commandBus: CommandBus;

  const userRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
  };
  const hashingService = { hash: jest.fn(), compare: jest.fn() };
  const userFactory = { create: jest.fn() };
  const notificationEvents = { userRegistered: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        RegisterHandler,
        UsersAccountService,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: HASHING_SERVICE, useValue: hashingService },
        { provide: UserFactory, useValue: userFactory },
        { provide: NotificationEventService, useValue: notificationEvents },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  it('creates the user, notifies, and returns a view without the password', async () => {
    const user = savedUser();
    userRepository.findByEmail.mockResolvedValue(null);
    userFactory.create.mockResolvedValue(user);
    userRepository.save.mockResolvedValue(user);
    userRepository.findById.mockResolvedValue(user);

    const result = await commandBus.execute(
      new RegisterCommand('Ada', null, 'ada@b.com', 'Secret123!'),
    );

    expect(userFactory.create).toHaveBeenCalledWith({
      firstname: 'Ada',
      lastname: null,
      email: 'ada@b.com',
      password: 'Secret123!',
      socialId: null,
    });
    expect(notificationEvents.userRegistered).toHaveBeenCalledWith(user);

    expect(result).toMatchObject({
      userId: 1,
      firstname: 'Ada',
      userEmail: { email: 'ada@b.com', isVerified: false },
    });
    // La vue publique n'expose aucun champ password.
    expect(result).not.toHaveProperty('password');
  });

  it('refuses an email already registered', async () => {
    userRepository.findByEmail.mockResolvedValue(savedUser());

    await expect(
      commandBus.execute(
        new RegisterCommand('Ada', null, 'ada@b.com', 'Secret123!'),
      ),
    ).rejects.toThrow(EmailAlreadyInUseError);

    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
