import { Command } from '@nestjs/cqrs';
import { PublicUserView } from '../contracts/user-account.contract';
import { UserRole, UserStatus } from 'src/users/domains/enums/user.enum';

export class UpdateUserByAdminCommand extends Command<PublicUserView> {
  constructor(
    /** L'administrateur qui agit — l'autorisation est vérifiée par le handler. */
    public readonly requesterId: number,
    public readonly targetUserId: number,
    public readonly firstname?: string,
    public readonly lastname?: string | null,
    public readonly role?: UserRole,
    public readonly status?: UserStatus,
  ) {
    super();
  }
}
