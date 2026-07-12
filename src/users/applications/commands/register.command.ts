import { Command } from '@nestjs/cqrs';
import { PublicUserView } from '../contracts/user-account.contract';

export class RegisterCommand extends Command<PublicUserView> {
  constructor(
    public readonly firstname: string,
    public readonly lastname: string | null,
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
