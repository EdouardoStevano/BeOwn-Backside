import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ReservationRepository } from 'src/reservations/applications/ports/repositories/reservation.repository';
import { Reservation } from 'src/reservations/domains/reservation';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';
import { ReservationEntity } from '../entities/reservation.entity';
import { ReservationMapper } from '../mappers/reservation.mapper';

@Injectable()
export class ReservationTypeOrmRepository implements ReservationRepository {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly repo: Repository<ReservationEntity>,
  ) {}

  async save(reservation: Reservation): Promise<Reservation> {
    const entity = ReservationMapper.toEntity(reservation);
    const saved = await this.repo.save(entity);
    return ReservationMapper.toDomain(saved);
  }

  async findById(id: string): Promise<Reservation | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? ReservationMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: number): Promise<Reservation[]> {
    const entities = await this.repo.find({
      where: { utilisateurId: userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(ReservationMapper.toDomain);
  }

  async findByProjetId(projetId: string): Promise<Reservation[]> {
    const entities = await this.repo.find({
      where: { projetId },
      order: { rangFile: 'ASC' },
    });
    return entities.map(ReservationMapper.toDomain);
  }

  async findActiveByProjetId(projetId: string): Promise<Reservation[]> {
    const entities = await this.repo.find({
      where: {
        projetId,
        statut: In([ReservationStatus.EN_ATTENTE, ReservationStatus.VALIDEE]),
      },
      order: { rangFile: 'ASC' },
    });
    return entities.map(ReservationMapper.toDomain);
  }

  async countMontantReserveByProjet(projetId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.montantReserve), 0)', 'total')
      .where('r.projetId = :projetId', { projetId })
      .andWhere('r.statut IN (:...statuts)', {
        statuts: [ReservationStatus.EN_ATTENTE, ReservationStatus.VALIDEE],
      })
      .getRawOne();
    return Number(result?.total ?? 0);
  }

  async getNextRangByProjet(projetId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('r')
      .select('COALESCE(MAX(r.rangFile), 0)', 'maxRang')
      .where('r.projetId = :projetId', { projetId })
      .getRawOne();
    return (result?.maxRang ?? 0) + 1;
  }

  async update(reservation: Reservation): Promise<Reservation> {
    const entity = ReservationMapper.toEntity(reservation);
    const saved = await this.repo.save(entity);
    return ReservationMapper.toDomain(saved);
  }

  async cancelAllByProjet(
    projetId: string,
    motif: ReservationStatus,
  ): Promise<void> {
    await this.repo.update(
      {
        projetId,
        statut: In([ReservationStatus.EN_ATTENTE, ReservationStatus.VALIDEE]),
      },
      { statut: motif },
    );
  }
}
