import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReservationCapacity } from '../../domain/aggregates/reservation-capacity';
import { ReservationStatus } from '../../domain/enums/reservation-status.enum';
import { ReservationCapacityRepository } from '../../domain/repositories/reservation-capacity.repository';
import { ReservationEntity } from '../persistence/entities/reservation.entity';

/**
 * Reconstitue la capacité d'un projet en **une** requête : somme des montants
 * actifs (EN_ATTENTE, VALIDEE — les mêmes états que l'ancienne
 * `countMontantReserveByProjet`) et rang maximal toutes réservations
 * confondues (comme l'ancienne `getNextRangByProjet` : un rang libéré par
 * annulation n'est jamais réattribué).
 *
 * L'allocation concurrente reste bornée par l'index unique
 * `UQ_reservation_project_rank` : deux allocations simultanées du même rang
 * font échouer la seconde insertion au commit, au lieu de créer un doublon.
 */
@Injectable()
export class TypeOrmReservationCapacityRepository
  implements ReservationCapacityRepository
{
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly repo: Repository<ReservationEntity>,
  ) {}

  async chargerParProjet(
    projetId: string,
    plafond: number | null,
  ): Promise<ReservationCapacity> {
    const etat: { reserve: string | null; maxRang: number | null } | undefined =
      await this.repo
        .createQueryBuilder('r')
        .select(
          'COALESCE(SUM(r.montantReserve) FILTER (WHERE r.statut IN (:...actifs)), 0)',
          'reserve',
        )
        .addSelect('MAX(r.rangFile)', 'maxRang')
        .where('r.projetId = :projetId', { projetId })
        .setParameter('actifs', [
          ReservationStatus.EN_ATTENTE,
          ReservationStatus.VALIDEE,
        ])
        .getRawOne();

    return ReservationCapacity.reconstituer({
      projetId,
      plafond,
      montantDejaReserve: Number(etat?.reserve ?? 0),
      prochainRangChronologique: Number(etat?.maxRang ?? 0) + 1,
    });
  }
}
