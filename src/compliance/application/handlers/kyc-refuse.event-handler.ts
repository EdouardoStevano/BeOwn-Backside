import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { KycRefuseDomainEvent } from 'src/compliance/domain/events/kyc-refuse.domain-event';

/** Ce que l'audit reçoit quand l'administrateur n'a pas motivé son refus. */
const MOTIF_NON_PRECISE = '—';

/**
 * Ce qui suit le refus manuel d'un dossier : l'annonce au titulaire — avec le
 * motif s'il y en a un, puisque c'est ce qui lui dit quoi corriger — et la
 * trace d'audit de la décision.
 *
 * Jumeau de `KycValideEventHandler`, et séparé de lui pour la même raison que
 * les deux événements le sont : les messages, le type de notification et les
 * suites possibles n'ont rien en commun. Les fondre donnerait un handler qui
 * commence par retrouver, dans un `if`, la décision que l'événement portait
 * déjà.
 *
 * **Le refus reste acquis quoi qu'il arrive ici** : le bus n'attend pas les
 * réactions, et chacune est gardée séparément.
 */
@EventsHandler(KycRefuseDomainEvent)
export class KycRefuseEventHandler implements IEventHandler<KycRefuseDomainEvent> {
  private readonly logger = new Logger(KycRefuseEventHandler.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async handle(event: KycRefuseDomainEvent): Promise<void> {
    await this.notifierTitulaire(event);
    await this.tracerDecision(event);
  }

  private async notifierTitulaire(event: KycRefuseDomainEvent): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: event.utilisateurId,
        type: NotificationType.KYC_REJETE,
        titre: 'KYC refusé',
        message: event.motifRefus
          ? `Votre KYC a été refusé : ${event.motifRefus}`
          : 'Votre KYC a été refusé. Merci de mettre à jour votre dossier.',
        metadata: { motifRefus: event.motifRefus },
      });
    } catch (err) {
      this.logger.error(
        `Refus KYC non annoncé à l'utilisateur ${event.utilisateurId} (dossier ${event.kycId}) — le dossier est bien refusé, mais il ne sait pas quoi corriger.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async tracerDecision(event: KycRefuseDomainEvent): Promise<void> {
    try {
      await this.notificationEvents.kycRejectedByAdmin(
        event.utilisateurId,
        event.motifRefus ?? MOTIF_NON_PRECISE,
        event.decidePar,
      );
    } catch (err) {
      this.logger.error(
        `Trace d'audit manquante pour le refus du dossier ${event.kycId} par l'administrateur ${event.decidePar}.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
