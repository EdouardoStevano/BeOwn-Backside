import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { KycRevueManuelleDemandeeDomainEvent } from 'src/onboarding/domain/events/kyc-revue-manuelle-demandee.domain-event';

/**
 * Ce qui suit une demande de revue manuelle sans la conditionner : l'alerte de
 * la compliance, qui doit examiner le dossier.
 *
 * Cette réaction vivait dans `ProfileController.requestManualReview`, juste
 * après l'appel au use case — de la logique métier dans la couche présentation
 * (§12.5), et un contrôleur qui savait quels rôles alerter. Elle en sort pour
 * la raison qui justifie l'existence des Domain Events (§8) : passer un dossier
 * en revue et prévenir ceux qui l'examineront sont deux sujets.
 *
 * **Le passage en revue reste acquis quoi qu'il arrive ici.** Le bus publie de
 * façon synchrone mais n'attend pas les réactions : l'utilisateur reçoit sa
 * réponse dès que le dossier a changé de statut, comme avant. Une notification
 * qui échoue est désormais **tracée** — le `.catch(() => {})` du contrôleur
 * l'avalait en silence, et un dossier pouvait attendre indéfiniment une
 * compliance jamais prévenue, sans la moindre trace.
 */
@EventsHandler(KycRevueManuelleDemandeeDomainEvent)
export class KycRevueManuelleDemandeeEventHandler implements IEventHandler<KycRevueManuelleDemandeeDomainEvent> {
  private readonly logger = new Logger(
    KycRevueManuelleDemandeeEventHandler.name,
  );

  constructor(private readonly notifications: NotificationService) {}

  async handle(event: KycRevueManuelleDemandeeDomainEvent): Promise<void> {
    try {
      await this.notifications.pushToAdmins({
        type: NotificationType.KYC_REVUE_MANUELLE,
        titre: 'KYC en revue manuelle',
        message: `Un utilisateur (#${event.utilisateurId}) a déposé ses documents manuellement — dossier à valider.`,
        roles: [UserRole.COMPLIANCE, UserRole.SUPER_ADMIN],
        metadata: { userId: event.utilisateurId, kycId: event.kycId },
      });
    } catch (err) {
      this.logger.error(
        `Compliance non prévenue de la revue manuelle demandée pour l'utilisateur ${event.utilisateurId} (dossier ${event.kycId}) — le dossier est bien en revue, mais personne n'a été alerté.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
