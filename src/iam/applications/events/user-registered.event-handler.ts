import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserRegisteredDomainEvent } from 'src/iam/domains/events/user-registered.domain-event';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { SendEmailVerificationUseCase } from '../usecases/email/send-email-verification.usecase';
import { AssurerCodeParrainageService } from 'src/parrainage/applications/assurer-code-parrainage.service';
import { RattacherFilleulService } from 'src/parrainage/applications/rattacher-filleul.service';

/**
 * Tout ce qui suit une inscription sans la conditionner : le lien de
 * vérification envoyé au nouvel inscrit, et l'annonce faite aux
 * administrateurs.
 *
 * Ces deux réactions vivaient dans `RegisterUseCase`, juste après la
 * sauvegarde. Elles en sortent pour la raison qui justifie l'existence des
 * Domain Events (§8) : s'inscrire, prévenir l'inscrit et prévenir
 * l'administration sont trois sujets, et le use case n'a à connaître que le
 * premier. Le jour où l'inscription doit aussi alimenter un CRM ou une
 * statistique, c'est un abonné de plus, sans rouvrir le use case.
 *
 * **Conséquence à connaître** : `POST /auth/sign-up` répond désormais sans
 * attendre le mail. Le bus publie de façon synchrone mais n'attend pas les
 * réactions — l'inscription est acquise dès la sauvegarde, et l'appelant n'a
 * jamais eu à attendre l'email pour recevoir sa réponse.
 *
 * Les deux réactions sont indépendantes et gardées séparément : une panne du
 * mailer ne doit pas priver les administrateurs de leur notification, et
 * réciproquement.
 */
@EventsHandler(UserRegisteredDomainEvent)
export class UserRegisteredEventHandler implements IEventHandler<UserRegisteredDomainEvent> {
  private readonly logger = new Logger(UserRegisteredEventHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
    private readonly sendEmailVerificationUseCase: SendEmailVerificationUseCase,
    private readonly codesParrainage: AssurerCodeParrainageService,
    private readonly rattacherFilleul: RattacherFilleulService,
  ) {}

  async handle(event: UserRegisteredDomainEvent): Promise<void> {
    // L'inscrit d'abord : c'est lui qui attend quelque chose.
    await this.sendVerificationLink(event);
    await this.notifyAdministrators(event);
    await this.initialiserParrainage(event);
  }

  /**
   * L'adresse vient de l'événement, pas d'une relecture : c'est celle du compte
   * persisté au moment de l'inscription. L'envoi reste délégué à
   * `SendEmailVerificationUseCase` plutôt que réimplémenté ici — une seule
   * façon d'émettre un lien de vérification dans toute l'app, que la demande
   * vienne du sign-up ou de `POST /auth/email/send-verification`.
   */
  private async sendVerificationLink(
    event: UserRegisteredDomainEvent,
  ): Promise<void> {
    // Le compte est créé (CREE) que cet envoi aboutisse ou non : une panne du
    // fournisseur d'emails ne doit jamais défaire une inscription déjà
    // persistée. En cas d'échec on se contente de logger — l'utilisateur peut
    // redemander un lien via POST /auth/email/send-verification.
    try {
      await this.sendEmailVerificationUseCase.execute(event.email);
    } catch (err) {
      this.logger.error(
        `Échec de l'envoi du lien de vérification à ${event.email} lors du sign-up — l'utilisateur pourra le redemander via /auth/email/send-verification.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Le compte est relu ici plutôt que transporté par l'événement : le service
   * de notifications compose son message à partir du profil complet, que
   * l'événement n'a pas vocation à porter.
   */
  private async notifyAdministrators(
    event: UserRegisteredDomainEvent,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findById(event.userId);
      if (!user) return;

      await this.notificationEvents.userRegistered(user);
    } catch (err) {
      this.logger.error(
        `Notification d'inscription non délivrée pour l'utilisateur ${event.userId}.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Parrainage : le nouveau compte reçoit SON code, et se rattache à son
   * parrain si un code valide accompagnait l'inscription. Même contrat que
   * les deux autres réactions — un échec se journalise et ne défait rien :
   * le filet du code manquant est la génération à la première lecture de
   * `GET /parrainage/me` (documenté dans AssurerCodeParrainageService).
   */
  private async initialiserParrainage(
    event: UserRegisteredDomainEvent,
  ): Promise<void> {
    try {
      await this.codesParrainage.assurer(event.userId);
      await this.rattacherFilleul.rattacher(event.userId, event.codeParrainage);
    } catch (err) {
      this.logger.error(
        `Initialisation du parrainage échouée pour le compte ${event.userId} — l'inscription n'est pas affectée.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
