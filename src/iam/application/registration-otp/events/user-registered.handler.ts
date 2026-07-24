import { Logger } from '@nestjs/common';
import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserRegisteredEvent } from 'src/users/applications/contracts/user-registered.event';
import { SendRegistrationOtpCommand } from '../commands/registration-otp.commands';

/**
 * Le seul lien entre « un compte vient d'être créé » (Users) et « il faut lui
 * envoyer son code » (IAM). Passer par l'événement plutôt que par un appel
 * direct évite que Users ait à connaître IAM, et couvre du même coup les deux
 * portes d'entrée de l'inscription (POST /users et POST /auth/sign-up).
 *
 * L'échec d'envoi est avalé : le compte est créé quoi qu'il arrive, une panne
 * du fournisseur d'email ne doit pas faire échouer une inscription. À défaut,
 * l'utilisateur redemande un code via POST /auth/resend-otp.
 */
@EventsHandler(UserRegisteredEvent)
export class SendOtpOnUserRegistered implements IEventHandler<UserRegisteredEvent> {
  private readonly logger = new Logger(SendOtpOnUserRegistered.name);

  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: UserRegisteredEvent): Promise<void> {
    try {
      await this.commandBus.execute(
        new SendRegistrationOtpCommand(event.userId, event.email, 'email'),
      );
    } catch (err) {
      this.logger.error(
        `Échec de l'envoi du code d'inscription à ${event.email} — il pourra le redemander via /auth/resend-otp.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
