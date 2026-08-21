import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { ProjectRepository } from 'src/catalog/domain/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/catalog/domain/repositories/project.repository';
import type { Reservation } from '../../domain/aggregates/reservation';
import { ReservationCreeeDomainEvent } from '../../domain/events/reservation-creee.domain-event';
import { ProjetIntrouvableError } from '../../domain/errors/reservation.errors';
import { ReservationFactory } from '../../domain/factories/reservation.factory';
import type { ReservationRankingPolicy } from '../../domain/policies/reservation-ranking.policy';
import { RESERVATION_RANKING_POLICY } from '../../domain/policies/reservation-ranking.policy';
import type { ReservationCapacityRepository } from '../../domain/repositories/reservation-capacity.repository';
import { RESERVATION_CAPACITY_REPOSITORY } from '../../domain/repositories/reservation-capacity.repository';
import type { ReservationRepository } from '../../domain/repositories/reservation.repository';
import { RESERVATION_REPOSITORY } from '../../domain/repositories/reservation.repository';
import { ProjetReservableTranslator } from '../acl/projet-reservable.translator';
import { CreateReservationDto } from '../../presentation/http/dto/reservation.dto';

/**
 * **Réserver** — le cas d'utilisation du Core Domain (§1) : verrouiller un
 * engagement sur un projet ANNONCÉ, avec rang de conversion prioritaire.
 *
 * Le use case orchestre, il ne décide pas (§14) : il charge le projet amont,
 * le traduit en {@link ProjetReservable} (ACL, §13), charge la capacité de la
 * file, puis laisse `ReservationFactory` et `ReservationCapacity` éprouver
 * toutes les portes — fenêtre ANNONCÉ, bornes de ticket, plafond, rang. Les
 * cinq `if` qui vivaient ici sont partis dans le domaine.
 *
 * L'éligibilité de l'investisseur (RG-RES-03) est éprouvée en amont de la
 * route par `KycValidatedGuard` — verdict de `compliance` (§3.4).
 */
@Injectable()
export class CreateReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepository,
    @Inject(RESERVATION_CAPACITY_REPOSITORY)
    private readonly capacites: ReservationCapacityRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projets: ProjectRepository,
    @Inject(RESERVATION_RANKING_POLICY)
    private readonly politiqueDeRang: ReservationRankingPolicy,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    utilisateurId: number,
    dto: CreateReservationDto,
  ): Promise<Reservation> {
    const projetCatalogue = await this.projets.findProjectById(dto.projetId);
    if (!projetCatalogue) {
      throw new ProjetIntrouvableError(dto.projetId);
    }
    const projet = ProjetReservableTranslator.traduire(projetCatalogue);

    const capacite = await this.capacites.chargerParProjet(
      projet.projetId,
      projet.plafondPreInvestissement,
    );

    const naissante = ReservationFactory.creer(
      { projet, utilisateurId, montant: dto.montant },
      capacite,
      this.politiqueDeRang,
    );

    const reservation = await this.reservations.creer(naissante);

    // Publication best-effort après persistance, comme dans `catalog` : le
    // jour où un abonné critique s'y branche (HOLD des fonds), ce publish
    // devra passer par un Outbox (§19).
    this.eventBus.publish(
      new ReservationCreeeDomainEvent(
        reservation.id,
        reservation.projetId,
        reservation.utilisateurId,
        reservation.montantReserve,
        reservation.rang?.valeur ?? null,
      ),
    );

    return reservation;
  }
}
