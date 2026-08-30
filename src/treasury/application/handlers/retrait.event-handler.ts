import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import {
  RetraitADemanderManuellementDomainEvent,
  RetraitEchoueDomainEvent,
  RetraitEnRouteDomainEvent,
  RetraitEnSouffranceDomainEvent,
  RetraitVerseDomainEvent,
} from 'src/treasury/domain/events/retrait.domain-event';
import {
  TREASURY_NOTIFIER,
  type TreasuryNotifier,
} from '../ports/treasury-notifier.port';

type FaitDeRetrait =
  | RetraitEnRouteDomainEvent
  | RetraitADemanderManuellementDomainEvent
  | RetraitVerseDomainEvent
  | RetraitEchoueDomainEvent
  | RetraitEnSouffranceDomainEvent;

/**
 * Ce qui suit un fait de retrait : quelqu'un l'apprend.
 *
 * **C'est le seul endroit du parcours de retrait qui sache qu'on notifie.** Le
 * port {@link TreasuryNotifier} était injecté dans quatre use cases, qui
 * décidaient donc eux-mêmes qui devait savoir quoi — une responsabilité qui
 * n'est pas la leur (§14). Ils constatent désormais des faits ; l'annonce est
 * une **réaction**, et §3.3 est explicite : `notifications` est un abonné
 * technique aux événements de domaine, jamais un service que le métier appelle.
 *
 * **Cinq faits, un seul abonné.** Ils partagent leur port, leur gestion
 * d'erreur et leur raison d'être ; les séparer en cinq fichiers aurait dupliqué
 * les trois pour une différence de méthode appelée. Le jour où l'un d'eux
 * demandera autre chose qu'une notification — une écriture au journal d'audit
 * sur les retraits échoués, une alerte au-delà d'un certain montant — il
 * prendra son propre abonné, sans que celui-ci bouge.
 *
 * **Le retrait reste acquis quoi qu'il arrive ici.** Le bus n'attend pas les
 * réactions, et l'échec d'une annonce ne défait pas un mouvement de fonds : il
 * est journalisé pour qu'on puisse le rattraper. C'est déjà la garantie que le
 * port porte — aucune de ses méthodes ne rejette — mais la redire ici évite
 * qu'un abonné futur, moins prudent, ne fasse échouer un versement en voulant
 * l'annoncer.
 */
@EventsHandler(
  RetraitEnRouteDomainEvent,
  RetraitADemanderManuellementDomainEvent,
  RetraitVerseDomainEvent,
  RetraitEchoueDomainEvent,
  RetraitEnSouffranceDomainEvent,
)
export class RetraitEventHandler implements IEventHandler<FaitDeRetrait> {
  private readonly logger = new Logger(RetraitEventHandler.name);

  constructor(
    @Inject(TREASURY_NOTIFIER)
    private readonly notifier: TreasuryNotifier,
  ) {}

  handle(event: FaitDeRetrait): void {
    try {
      this.annoncer(event);
    } catch (err) {
      this.logger.error(
        `Fait de retrait non annoncé (${event.constructor.name}) — ` +
          `le mouvement est bien enregistré, mais personne ne l'apprend.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** À chaque fait son destinataire, et son message. */
  private annoncer(event: FaitDeRetrait): void {
    if (event instanceof RetraitEnRouteDomainEvent) {
      return this.notifier.retraitEnRoute(event);
    }

    if (event instanceof RetraitADemanderManuellementDomainEvent) {
      // Le seul dont le destinataire n'est pas le titulaire : c'est une tâche
      // pour l'équipe finance.
      return this.notifier.retraitManuelADemander(event);
    }

    if (event instanceof RetraitVerseDomainEvent) {
      return this.notifier.retraitVerse(event);
    }

    if (event instanceof RetraitEchoueDomainEvent) {
      return this.notifier.retraitEchoue(event);
    }

    return this.notifier.interventionRequise(event);
  }
}
