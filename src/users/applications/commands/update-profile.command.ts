import { Command } from '@nestjs/cqrs';
import { PublicUserView } from '../contracts/user-account.contract';

/** Mise à jour par l'utilisateur de sa propre identité. */
export class UpdateProfileCommand extends Command<PublicUserView> {
  constructor(
    public readonly userId: number,
    public readonly firstname?: string,
    public readonly lastname?: string | null,
  ) {
    super();
  }
}
