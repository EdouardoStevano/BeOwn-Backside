import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import {
  CompteDeRetraitActiveDomainEvent,
  DepotCrediteDomainEvent,
} from 'src/treasury/domain/events/depot.domain-event';
import {
  TREASURY_NOTIFIER,
  type TreasuryNotifier,
} from '../ports/treasury-notifier.port';

type FaitDEntreeDeFonds =
  | DepotCrediteDomainEvent
  | CompteDeRetraitActiveDomainEvent;

/**
 * Ce qui suit l'arrivée d'argent, et l'ouverture du chemin par lequel il
 * repartira.
 *
 * **Deux faits que rien ne relie côté métier**, réunis parce qu'ils partagent
 * leur abonné et leur raison d'être : ce sont les deux nouvelles qu'un
 * titulaire reçoit hors du parcours de retrait. Les séparer en deux fichiers
 * aurait dupliqué la gestion d'erreur pour une différence de méthode appelée —
 * le même arbitrage que {@link RetraitEventHandler}.
 *
 * **C'est ici que se décide qui apprend un dépôt.** Le use case en avertissait
 * lui-même le titulaire *et* le back-office, par deux appels successifs : il
 * créditait et choisissait les destinataires. Le second est désormais une
 * décision d'abonné — la finance suit les entrées d'argent, et ce suivi peut
 * gagner un seuil ou un filtre sans qu'on rouvre le crédit.
 *
 * **Le crédit reste acquis quoi qu'il arrive ici.** Le bus n'attend pas les
 * réactions, et l'échec d'une annonce ne défait pas un mouvement de fonds.
 */
@EventsHandler(DepotCrediteDomainEvent, CompteDeRetraitActiveDomainEvent)
export class DepotEventHandler implements IEventHandler<FaitDEntreeDeFonds> {
  private readonly logger = new Logger(DepotEventHandler.name);

  constructor(
    @Inject(TREASURY_NOTIFIER)
    private readonly notifier: TreasuryNotifier,
  ) {}

  handle(event: FaitDEntreeDeFonds): void {
    try {
      this.annoncer(event);
    } catch (err) {
      this.logger.error(
        `Fait d'entrée de fonds non annoncé (${event.constructor.name}) — ` +
          `le mouvement est bien enregistré, mais personne ne l'apprend.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private annoncer(event: FaitDEntreeDeFonds): void {
    if (event instanceof CompteDeRetraitActiveDomainEvent) {
      return this.notifier.compteDeRetraitActive(event);
    }

    // Un dépôt intéresse deux personnes : celui qui l'a fait, et la finance
    // qui suit les entrées d'argent.
    this.notifier.depotCredite(event);
    this.notifier.depotCrediteAuxAdministrateurs(event);
  }
}
