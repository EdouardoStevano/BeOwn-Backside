import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { KycValideDomainEvent } from 'src/compliance/domain/events/kyc-valide.domain-event';

/**
 * Ce qui suit la validation manuelle d'un dossier sans la conditionner :
 * l'annonce au titulaire, et la trace d'audit de la décision.
 *
 * Ces deux réactions vivaient dans `ProfileController.patchKycStatus`, dans une
 * branche `if (dto.status === VALIDE)`. Elles en sortent pour la raison qui
 * justifie l'existence des Domain Events (§8) : trancher un dossier, prévenir
 * son titulaire et tracer la décision sont trois sujets, et le contrôleur n'a à
 * connaître aucun des trois.
 *
 * **La décision reste acquise quoi qu'il arrive ici.** Le bus publie de façon
 * synchrone mais n'attend pas les réactions : l'admin reçoit sa réponse dès que
 * le dossier a changé de statut, comme avant. Les deux réactions sont gardées
 * séparément — une panne du stockage de notifications ne doit pas priver
 * l'audit de sa trace, et réciproquement.
 */
@EventsHandler(KycValideDomainEvent)
export class KycValideEventHandler implements IEventHandler<KycValideDomainEvent> {
  private readonly logger = new Logger(KycValideEventHandler.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async handle(event: KycValideDomainEvent): Promise<void> {
    // Le titulaire d'abord : c'est lui qui attend quelque chose.
    await this.notifierTitulaire(event);
    await this.tracerDecision(event);
  }

  private async notifierTitulaire(event: KycValideDomainEvent): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: event.utilisateurId,
        type: NotificationType.KYC_VALIDE,
        titre: 'KYC validé',
        message:
          'Votre KYC a été validé. Vous pouvez désormais investir sur BeOwn.',
        metadata: { decidedAt: event.occurredAt.toISOString() },
      });
    } catch (err) {
      this.logger.error(
        `Validation KYC non annoncée à l'utilisateur ${event.utilisateurId} (dossier ${event.kycId}) — le dossier est bien validé.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async tracerDecision(event: KycValideDomainEvent): Promise<void> {
    try {
      await this.notificationEvents.kycValidatedByAdmin(
        event.utilisateurId,
        event.decidePar,
      );
    } catch (err) {
      this.logger.error(
        `Trace d'audit manquante pour la validation du dossier ${event.kycId} par l'administrateur ${event.decidePar}.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
