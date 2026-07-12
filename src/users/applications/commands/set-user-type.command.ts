import { Command } from '@nestjs/cqrs';
import { PublicUserView } from '../contracts/user-account.contract';
import { UserType } from 'src/users/domains/enums/user.enum';

export class SetUserTypeCommand extends Command<PublicUserView> {
  constructor(
    public readonly userId: number,
    public readonly userType: UserType,
  ) {
    super();
  }
}
