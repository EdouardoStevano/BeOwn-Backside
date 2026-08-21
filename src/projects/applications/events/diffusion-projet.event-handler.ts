import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BroadcastService } from 'src/notifications/applications/broadcast.service';
import { CollecteOuverteDomainEvent } from 'src/projects/domains/events/collecte-ouverte.domain-event';
import { ProjetAnnonceDomainEvent } from 'src/projects/domains/events/projet-annonce.domain-event';

/**
 * Diffusion « ouverture de réservation », au passage d'un projet en `ANNONCE`.
 *
 * `UpdateProjectStatusUseCase` appelait `BroadcastService` en direct, dans un
 * `void … .catch(…)` — une manière d'admettre que la campagne ne devait jamais
 * faire échouer la transition. Le fait métier dit la même chose plus
 * franchement : la transition est acquise, la campagne suit (§8).
 *
 * L'anti-doublon inter-chemins reste où il était : le claim atomique sur
 * `broadcastAnnonceAt`, dans `BroadcastService`. Deux chemins mènent à
 * `ANNONCE` — le bouton « publier l'annonce » et le `PATCH` générique — et un
 * projet passé par les deux ne diffuse qu'une fois.
 */
@EventsHandler(ProjetAnnonceDomainEvent)
export class ProjetAnnonceEventHandler implements IEventHandler<ProjetAnnonceDomainEvent> {
  private readonly logger = new Logger(ProjetAnnonceEventHandler.name);

  constructor(private readonly broadcast: BroadcastService) {}

  async handle(event: ProjetAnnonceDomainEvent): Promise<void> {
    try {
      await this.broadcast.announceReservationOpened(
        event.projetId,
        event.declenchePar,
      );
    } catch (err) {
      this.logger.warn(
        `Diffusion « ouverture de réservation » échouée pour le projet ${event.projetId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Diffusion « nouveau projet », au passage d'un projet en `EN_COLLECTE`.
 *
 * `BroadcastService` pousse la notification in-app aux comptes **actifs**,
 * ajoute email et SMS selon les préférences et les bascules d'administration,
 * dédoublonne par un horodatage sur le projet, et n'échoue jamais bruyamment.
 */
@EventsHandler(CollecteOuverteDomainEvent)
export class CollecteOuverteEventHandler implements IEventHandler<CollecteOuverteDomainEvent> {
  private readonly logger = new Logger(CollecteOuverteEventHandler.name);

  constructor(private readonly broadcast: BroadcastService) {}

  async handle(event: CollecteOuverteDomainEvent): Promise<void> {
    try {
      await this.broadcast.announceProjectLaunched(
        event.projetId,
        event.declenchePar,
      );
    } catch (err) {
      this.logger.warn(
        `Diffusion « nouveau projet » échouée pour le projet ${event.projetId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
