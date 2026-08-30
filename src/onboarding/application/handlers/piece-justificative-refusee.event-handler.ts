import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { PieceJustificativeRefuseeDomainEvent } from 'src/onboarding/domain/events/piece-justificative-refusee.domain-event';
import { LIBELLE_PIECE } from 'src/onboarding/domain/enums/type-piece-justificative.enum';

/**
 * Ce qui suit le refus d'une pièce : le titulaire l'apprend, et sait quoi
 * corriger.
 *
 * C'est la première moitié de ce que demande le cahier des charges — *« en cas
 * de retour négatif, l'utilisateur sera notifié par mail et pourra modifier
 * lui-même les documents refusés »*. La seconde est servie par la route de
 * dépôt, qui remplace la pièce et remet son instruction à zéro.
 *
 * Le message **nomme la pièce et donne le motif**. C'est tout l'intérêt d'avoir
 * un statut par pièce plutôt qu'un seul pour le dossier : « votre dossier est
 * refusé » n'indique pas lequel des quatre documents reprendre.
 *
 * **Le refus reste acquis quoi qu'il arrive ici** : le bus n'attend pas les
 * réactions, et l'échec d'une notification ne défait pas une décision de
 * conformité — il est journalisé pour qu'on puisse la rattraper à la main.
 */
@EventsHandler(PieceJustificativeRefuseeDomainEvent)
export class PieceJustificativeRefuseeEventHandler implements IEventHandler<PieceJustificativeRefuseeDomainEvent> {
  private readonly logger = new Logger(
    PieceJustificativeRefuseeEventHandler.name,
  );

  constructor(private readonly notifications: NotificationService) {}

  async handle(event: PieceJustificativeRefuseeDomainEvent): Promise<void> {
    const libelle = LIBELLE_PIECE[event.type];

    try {
      await this.notifications.push({
        utilisateurId: event.utilisateurId,
        type: NotificationType.PIECE_JUSTIFICATIVE_REFUSEE,
        titre: 'Justificatif refusé',
        message: `Votre ${libelle} a été refusé : ${event.motif}. Vous pouvez déposer un nouveau document depuis votre dossier.`,
        metadata: {
          societeId: event.societeId,
          pieceId: event.pieceId,
          type: event.type,
          motif: event.motif,
        },
      });
    } catch (err) {
      this.logger.error(
        `Refus de la pièce ${event.pieceId} (${event.type}) non annoncé à l'utilisateur ${event.utilisateurId} — la pièce est bien refusée, mais il ne sait pas quoi corriger.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
