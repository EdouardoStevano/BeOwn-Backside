import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import {
  AdminAccessRequiredError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { PublicUserView } from '../contracts/user-account.contract';
import { UsersAccountService } from '../services/user-account.service';
import { UpdateUserByAdminCommand } from './update-user-by-admin.command';

@CommandHandler(UpdateUserByAdminCommand)
export class UpdateUserByAdminHandler implements ICommandHandler<UpdateUserByAdminCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(command: UpdateUserByAdminCommand): Promise<PublicUserView> {
    const requester = await this.userRepository.findById(command.requesterId);
    if (!requester?.isAdmin) throw new AdminAccessRequiredError();

    const target = await this.userRepository.findById(command.targetUserId);
    if (!target) throw new UserNotFoundError();

    // On ne notifie que les champs réellement modifiés : renvoyer un email
    // « votre profil a été modifié » pour un PATCH sans changement serait faux.
    const changed: string[] = [];

    if (
      command.firstname !== undefined &&
      command.firstname !== target.firstname
    ) {
      target.rename(command.firstname);
      changed.push('firstname');
    }
    if (
      command.lastname !== undefined &&
      (command.lastname ?? null) !== (target.lastname ?? null)
    ) {
      target.rename(undefined, command.lastname);
      changed.push('lastname');
    }
    if (command.role !== undefined && command.role !== target.role) {
      target.changeRole(command.role);
      changed.push('role');
    }
    if (command.status !== undefined && command.status !== target.status) {
      target.changeStatus(command.status);
      changed.push('status');
    }

    const updated = await this.userRepository.update(target);

    // `void` : notification en fire-and-forget, elle ne doit pas faire échouer
    // la mise à jour si l'envoi tombe.
    if (changed.length > 0 && target.userId !== command.requesterId) {
      void this.notificationEvents.profileUpdatedByAdmin(
        target.userId,
        changed,
        command.requesterId,
      );
    }

    return UsersAccountService.toPublicView(updated);
  }
}
