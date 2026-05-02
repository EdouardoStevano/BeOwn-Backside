import { Inject, Injectable } from '@nestjs/common';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import { User } from 'src/users/domains/user';
import { UserAlreadyExistsError } from 'src/users/domain/errors/user-already-exists.error';

export interface RegisterUserCommand {
  firstname: string;
  lastname?: string | null;
  email: string;
  password: string;
}

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(command: RegisterUserCommand): Promise<User> {
    const existing = await this.userRepository.findByEmail(command.email);
    if (existing) {
      throw new UserAlreadyExistsError(command.email);
    }

    const user = await this.userFactory.create({
      firstname: command.firstname,
      lastname: command.lastname ?? null,
      email: command.email,
      password: command.password,
      socialId: null,
    });

    return this.userRepository.save(user);
  }
}