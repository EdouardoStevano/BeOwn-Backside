import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersAccountService } from '../services/user-account.service';
import { PublicUserView } from '../contracts/user-account.contract';
import { RegisterCommand } from './register.command';

/**
 * Point d'entrée CQRS de l'inscription. La règle (unicité de l'email, hachage,
 * notification) vit dans UsersAccountService, que les autres contextes appellent
 * aussi par le contrat publié : les deux chemins partagent le même code.
 */
@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(private readonly userAccountService: UsersAccountService) {}

  execute(command: RegisterCommand): Promise<PublicUserView> {
    return this.userAccountService.register({
      firstname: command.firstname,
      lastname: command.lastname,
      email: command.email,
      password: command.password,
    });
  }
}
