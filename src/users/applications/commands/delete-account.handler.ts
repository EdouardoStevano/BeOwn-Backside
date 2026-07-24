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
import { DeleteAccountUseCase } from '../usecases/delete-account.usecase';
import { DeleteAccountCommand } from './delete-account.command';

/**
 * Suppression self-service : confirmation du mot de passe ici, puis délégation
 * des règles de suppression (bloqueurs financiers, versement automatique du
 * solde, notifications) à DeleteAccountUseCase.
 *
 * Le découpage n'est pas cosmétique : la confirmation du mot de passe ne
 * concerne que le parcours self-service, alors que le reste vaut aussi pour la
 * suppression déclenchée par un administrateur.
 */
@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler implements ICommandHandler<DeleteAccountCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    private readonly deleteAccount: DeleteAccountUseCase,
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

    await this.deleteAccount.execute(command.userId, {
      userId: command.userId,
      role: user.role,
    });
  }
}
