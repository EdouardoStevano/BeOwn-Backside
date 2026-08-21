import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { ProjetSoumisDomainEvent } from 'src/projects/domains/events/projet-soumis.domain-event';

/**
 * Prévient les administrateurs qu'un porteur a soumis un dossier à instruire.
 *
 * Destinataires inchangés : `SUPER_ADMIN`, `COMPLIANCE`, `FINANCIER` — ceux
 * qui conduisent la due diligence avant publication.
 *
 * Comme pour {@link ProjetPublieEventHandler}, la soumission reste acquise si
 * l'annonce échoue ; le porteur reçoit sa réponse dès que le dossier est
 * enregistré.
 */
@EventsHandler(ProjetSoumisDomainEvent)
export class ProjetSoumisEventHandler implements IEventHandler<ProjetSoumisDomainEvent> {
  private readonly logger = new Logger(ProjetSoumisEventHandler.name);

  constructor(private readonly notifications: NotificationService) {}

  async handle(event: ProjetSoumisDomainEvent): Promise<void> {
    try {
      await this.notifications.pushToAdmins({
        type: NotificationType.NOUVEAU_PROJET,
        titre: 'Nouveau projet soumis par un porteur',
        message: event.lieu
          ? `« ${event.titre} » (${event.lieu}) a été soumis pour revue. Vérifiez le dossier avant publication.`
          : `« ${event.titre} » a été soumis pour revue. Vérifiez le dossier avant publication.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.FINANCIER],
        metadata: {
          projectId: event.projetId,
          slug: event.slug,
          porteurId: event.porteurId,
          type: event.type,
          ville: event.ville,
        },
      });
    } catch (err) {
      this.logger.error(
        `Soumission du projet ${event.projetId} non signalée aux administrateurs — le dossier est bien enregistré.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
