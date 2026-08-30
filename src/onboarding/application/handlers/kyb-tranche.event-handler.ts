import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import {
  KybRefuseDomainEvent,
  KybValideDomainEvent,
} from 'src/onboarding/domain/events/kyb-tranche.domain-event';

type KybTranche = KybValideDomainEvent | KybRefuseDomainEvent;

/**
 * Ce qui suit la décision de conformité sur un dossier KYB : le titulaire
 * l'apprend.
 *
 * **Le refus d'une pièce ne le disait pas.** `PieceJustificativeRefusee`
 * annonce quel document reprendre ; il ne dit rien d'un dossier dont toutes les
 * pièces sont acceptées mais dont l'instruction conclut au rejet — registre qui
 * ne recoupe pas les statuts, actionnariat incohérent. Sans cet abonné, le
 * titulaire verrait sa société grisée sans qu'aucun message ne lui soit jamais
 * parvenu.
 *
 * Deux faits, un seul abonné : ils partagent leur destinataire, leur lecture et
 * leur gestion d'erreur, et les séparer aurait dupliqué les trois pour une
 * différence de libellé.
 *
 * **La décision reste acquise quoi qu'il arrive ici** : le bus n'attend pas les
 * réactions, et l'échec d'une notification ne défait pas un verdict de
 * conformité — il est journalisé pour qu'on puisse le rattraper à la main.
 */
@EventsHandler(KybValideDomainEvent, KybRefuseDomainEvent)
export class KybTrancheEventHandler implements IEventHandler<KybTranche> {
  private readonly logger = new Logger(KybTrancheEventHandler.name);

  constructor(private readonly notifications: NotificationService) {}

  async handle(event: KybTranche): Promise<void> {
    const valide = event instanceof KybValideDomainEvent;

    try {
      await this.notifications.push({
        utilisateurId: event.utilisateurId,
        type: valide
          ? NotificationType.KYB_VALIDE
          : NotificationType.KYB_REFUSE,
        titre: valide ? 'Dossier société validé' : 'Dossier société refusé',
        message: valide ? messageDeValidation(event) : messageDeRefus(event),
        metadata: {
          societeId: event.societeId,
          decidePar: event.decidePar,
          ...(valide
            ? { valideJusquAu: event.valideJusquAu }
            : { motif: event.motif }),
        },
      });
    } catch (err) {
      this.logger.error(
        `Décision KYB sur la société ${event.societeId} non annoncée à l'utilisateur ${event.utilisateurId} — le verdict est bien enregistré, mais il ne le sait pas.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

/**
 * L'échéance est dite quand elle existe : « votre société est habilitée » sans
 * dire jusqu'à quand oblige le titulaire à revenir le demander.
 */
function messageDeValidation(event: KybValideDomainEvent): string {
  const jusquAu = event.valideJusquAu
    ? ` Cette validation court jusqu'au ${event.valideJusquAu}.`
    : '';

  return `Le dossier de votre société a été validé : vous pouvez désormais investir en son nom.${jusquAu}`;
}

function messageDeRefus(event: KybRefuseDomainEvent): string {
  return `Le dossier de votre société a été refusé : ${event.motif}. Vous pouvez corriger vos justificatifs puis les redéposer depuis votre dossier.`;
}
