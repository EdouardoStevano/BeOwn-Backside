import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { ProjetReconsulteDomainEvent } from 'src/catalog/domain/events/projet-reconsulte.domain-event';

/**
 * Signale au chargé de relation qu'un investisseur revient sur le même projet.
 *
 * Une deuxième consultation est un signal d'intérêt : c'est le moment
 * d'appeler. Le message et les destinataires sont repris tels quels de la
 * méthode privée de `ProjectController`.
 */
@EventsHandler(ProjetReconsulteDomainEvent)
export class ProjetReconsulteEventHandler implements IEventHandler<ProjetReconsulteDomainEvent> {
  private readonly logger = new Logger(ProjetReconsulteEventHandler.name);

  constructor(private readonly notifications: NotificationService) {}

  async handle(event: ProjetReconsulteDomainEvent): Promise<void> {
    try {
      await this.notifications.pushToAdmins({
        type: NotificationType.PROJET_CONSULTE_2X,
        titre: 'Projet consulté 2 fois',
        message: `Un investisseur a consulté ce projet (« ${event.projetTitre} ») une 2ᵉ fois — opportunité de contact.`,
        roles: [UserRole.CHARGE_RELATION_INVESTISSEUR, UserRole.SUPER_ADMIN],
        metadata: {
          userId: event.utilisateurId,
          projetId: event.projetId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Consultation répétée du projet ${event.projetId} non signalée au chargé de relation.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
