import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { User } from 'src/users/domains/user';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { RegisterCommand } from './register.command';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(command: RegisterCommand): Promise<User> {
    const existing = await this.userRepository.findByEmail(command.email);
    if (existing) {
      throw new ConflictException('Un compte avec cette email existe déjà.');
    }

    const user = await this.userFactory.create({
      firstname: command.firstname,
      lastname: command.lastname,
      email: command.email,
      password: command.password,
      socialId: null,
    });

    const savedUser = await this.userRepository.save(user);

    const fullUser = await this.userRepository.findById(savedUser.userId);
    if (fullUser) this.notificationEvents.userRegistered(fullUser);

    return savedUser;
  }
}
