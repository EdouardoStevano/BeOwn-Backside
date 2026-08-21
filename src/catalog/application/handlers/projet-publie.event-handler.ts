import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { ProjetPublieDomainEvent } from 'src/catalog/domain/events/projet-publie.domain-event';

/**
 * Annonce aux investisseurs qu'un projet vient d'entrer au catalogue.
 *
 * La composition du message — libellé du lieu compris — vivait dans
 * `ProjectController.create`, dans un `if (project.statut !== BROUILLON)` suivi
 * d'un `.catch(() => {})` (§12.5). Elle en sort pour la raison qui justifie les
 * Domain Events (§8) : créer un projet et l'annoncer sont deux sujets.
 *
 * **La création reste acquise quoi qu'il arrive ici.** Le bus publie de façon
 * synchrone mais n'attend pas les réactions : l'admin reçoit sa réponse dès que
 * le projet est enregistré, comme avant. L'échec n'est plus avalé en silence.
 */
@EventsHandler(ProjetPublieDomainEvent)
export class ProjetPublieEventHandler implements IEventHandler<ProjetPublieDomainEvent> {
  private readonly logger = new Logger(ProjetPublieEventHandler.name);

  constructor(private readonly notifications: NotificationService) {}

  async handle(event: ProjetPublieDomainEvent): Promise<void> {
    try {
      await this.notifications.pushToInvestors({
        type: NotificationType.NOUVEAU_PROJET,
        titre: 'Nouveau projet disponible',
        message: event.lieu
          ? `Découvrez « ${event.titre} » à ${event.lieu}. Consultez les détails et investissez dès maintenant.`
          : `Découvrez le nouveau projet « ${event.titre} ». Consultez les détails et investissez dès maintenant.`,
        metadata: {
          projectId: event.projetId,
          slug: event.slug,
          statut: event.statut,
          ville: event.ville,
          type: event.type,
        },
      });
    } catch (err) {
      this.logger.error(
        `Projet ${event.projetId} non annoncé aux investisseurs — il est bien créé.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
