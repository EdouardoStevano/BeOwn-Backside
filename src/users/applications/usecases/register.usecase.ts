import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { RegisterDto } from 'src/users/presenters/dto/user.dto';
import { User } from 'src/users/domains/user';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(registerDto: RegisterDto): Promise<User> {
    const existing = await this.userRepository.findByEmail(registerDto.email);
    if (existing) {
      throw new ConflictException('Un compte avec cette email existe déjà.');
    }

    const user = await this.userFactory.create({
      firstname: registerDto.firstname,
      lastname: registerDto.lastname ?? null,
      email: registerDto.email,
      password: registerDto.password,
      socialId: null,
    });

    const savedUser = await this.userRepository.save(user);

    const fullUser = await this.userRepository.findById(savedUser.userId);
    if (fullUser) this.notificationEvents.userRegistered(fullUser);

    return savedUser;
  }
}
