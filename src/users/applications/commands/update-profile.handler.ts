import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { UserNotFoundError } from 'src/users/domains/errors/user.errors';
import { PublicUserView } from '../contracts/user-account.contract';
import { UsersAccountService } from '../services/user-account.service';
import { UpdateProfileCommand } from './update-profile.command';

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfileCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(command: UpdateProfileCommand): Promise<PublicUserView> {
    const user = await this.userRepository.findById(command.userId);
    if (!user) throw new UserNotFoundError();

    user.rename(command.firstname, command.lastname);

    const updated = await this.userRepository.update(user);
    return UsersAccountService.toPublicView(updated);
  }
}
