import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Reservation,
  ReservationNaissante,
} from '../../domain/aggregates/reservation';
import { ReservationRepository } from '../../domain/repositories/reservation.repository';
import { ReservationEntity } from '../persistence/entities/reservation.entity';
import { ReservationOrmMapper } from '../persistence/mappers/reservation.orm-mapper';

@Injectable()
export class TypeOrmReservationRepository implements ReservationRepository {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly repo: Repository<ReservationEntity>,
  ) {}

  async creer(naissante: ReservationNaissante): Promise<Reservation> {
    const entity = ReservationOrmMapper.toNouvelleEntity(naissante);
    const saved = await this.repo.save(entity);
    return ReservationOrmMapper.toDomain(saved);
  }

  async save(reservation: Reservation): Promise<Reservation> {
    const entity = ReservationOrmMapper.toEntity(reservation);
    const saved = await this.repo.save(entity);
    return ReservationOrmMapper.toDomain(saved);
  }

  async findById(id: string): Promise<Reservation | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? ReservationOrmMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: number): Promise<Reservation[]> {
    const entities = await this.repo.find({
      where: { utilisateurId: userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(ReservationOrmMapper.toDomain);
  }

  async findByProjetId(projetId: string): Promise<Reservation[]> {
    const entities = await this.repo.find({
      where: { projetId },
      order: { rangFile: 'ASC' },
    });
    return entities.map(ReservationOrmMapper.toDomain);
  }
}
