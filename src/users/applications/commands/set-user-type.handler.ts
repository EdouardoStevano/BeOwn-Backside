import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import {
  InvalidUserTypeError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';
import { UserType } from 'src/users/domains/enums/user.enum';
import { PublicUserView } from '../contracts/user-account.contract';
import { UsersAccountService } from '../services/user-account.service';
import { SetUserTypeCommand } from './set-user-type.command';

@CommandHandler(SetUserTypeCommand)
export class SetUserTypeHandler implements ICommandHandler<SetUserTypeCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(command: SetUserTypeCommand): Promise<PublicUserView> {
    if (!Object.values(UserType).includes(command.userType)) {
      throw new InvalidUserTypeError();
    }

    const user = await this.userRepository.findById(command.userId);
    if (!user) throw new UserNotFoundError();

    user.setUserType(command.userType);

    const updated = await this.userRepository.update(user);
    return UsersAccountService.toPublicView(updated);
  }
}
