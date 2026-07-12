import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { UserPreferences } from 'src/users/domains/user-preferences';
import { UpdatePreferencesCommand } from './update-preferences.command';

@CommandHandler(UpdatePreferencesCommand)
export class UpdatePreferencesHandler implements ICommandHandler<UpdatePreferencesCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  execute(command: UpdatePreferencesCommand): Promise<UserPreferences> {
    return this.userRepository.savePreferences(command.userId, command.changes);
  }
}
