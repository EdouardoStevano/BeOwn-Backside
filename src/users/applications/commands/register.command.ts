import { Command } from '@nestjs/cqrs';
import { User } from 'src/users/domains/user';

export class RegisterCommand extends Command<User> {
  constructor(
    public readonly firstname: string,
    public readonly lastname: string | null,
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
