import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import {
  NoPasswordSetError,
  PasswordConfirmationFailedError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { DeleteAccountCommand } from './delete-account.command';

@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler implements ICommandHandler<DeleteAccountCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(command: DeleteAccountCommand): Promise<void> {
    const user = await this.userRepository.findByIdWithPassword(command.userId);
    if (!user) throw new UserNotFoundError();

    if (!user.hasPassword) throw new NoPasswordSetError();

    const confirmed = await this.hashingService.compare(
      command.password,
      user.password!,
    );
    if (!confirmed) throw new PasswordConfirmationFailedError();

    user.markAsDeleted();
    await this.userRepository.update(user);

    // `void` : notification en fire-and-forget — le compte est supprimé, que
    // l'email de confirmation parte ou non.
    void this.notificationEvents.accountDeletedByUser(user);
  }
}
