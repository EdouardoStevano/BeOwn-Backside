import { Command } from '@nestjs/cqrs';

/** Suppression logique du compte, confirmée par le mot de passe. */
export class DeleteAccountCommand extends Command<void> {
  constructor(
    public readonly userId: number,
    public readonly password: string,
  ) {
    super();
  }
}
