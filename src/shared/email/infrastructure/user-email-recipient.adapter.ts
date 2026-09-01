import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  EmailRecipientReader,
  type EmailRecipient,
} from '../ports/email-recipient.port';

/**
 * Adaptateur du port `EmailRecipientReader` sur le référentiel utilisateurs.
 *
 * Il ne dépend que du PORT `USER_REPOSITORY` (couche domaine IAM), jamais de
 * TypeORM ni des entités : `shared/` reste sans dépendance d'infrastructure.
 */
@Injectable()
export class UserEmailRecipientAdapter implements EmailRecipientReader {
  private readonly logger = new Logger(UserEmailRecipientAdapter.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async findByUserId(userId: number): Promise<EmailRecipient | null> {
    const user = await this.users.findById(userId);
    const email = user?.emailOrNull;
    if (!user || !email) return null;

    // Défaut PROTECTEUR À L'ENVERS, et c'est volontaire : si les préférences
    // sont illisibles, on considère que le canal e-mail est actif. Il s'agit
    // ici d'e-mails opérationnels — dépôt crédité, retrait exécuté, décision
    // KYC, revenus versés — dont le silence prive l'utilisateur d'une
    // information sur son propre argent. Un incident technique ne doit pas
    // produire ce silence ; seul un refus EXPLICITE le doit.
    let accepteEmail = true;
    try {
      const prefs = await this.users.findPreferences(userId);
      accepteEmail = prefs?.notifEmail !== false;
    } catch (err) {
      this.logger.warn(
        `Préférences e-mail illisibles pour l'utilisateur #${userId} — envoi maintenu : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return {
      email,
      prenom: user.firstname || 'Investisseur',
      accepteEmail,
    };
  }
}
