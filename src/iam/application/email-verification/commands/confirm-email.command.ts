import { Command } from '@nestjs/cqrs';

/** Renvoie l'adresse confirmée — le rendu de la page est l'affaire du presenter. */
export class ConfirmEmailCommand extends Command<string> {
  constructor(public readonly token: string) {
    super();
  }
}
