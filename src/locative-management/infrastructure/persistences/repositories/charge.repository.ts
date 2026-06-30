import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Charge } from '../../../domains/charge';
import { ChargeRepository } from '../../../applications/ports/repositories/charge.repository';
import { ChargeEntity } from '../entities/charge.entity';
import { ChargeMapper } from '../mappers/charge.mapper';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';

@Injectable()
export class ChargeTypeOrmRepository implements ChargeRepository {
  constructor(
    @InjectRepository(ChargeEntity)
    private readonly repo: Repository<ChargeEntity>,
  ) {}

  async save(c: Charge): Promise<Charge> {
    return ChargeMapper.toDomain(
      await this.repo.save(ChargeMapper.toEntity(c)),
    );
  }

  async findById(id: string): Promise<Charge | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? ChargeMapper.toDomain(f) : null;
  }

  async findByProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<Charge[]> {
    const list = await this.repo.find({ where: { projetId, periode } });
    return list.map(ChargeMapper.toDomain);
  }

  async findByStatut(statut: StatutDeclaration): Promise<Charge[]> {
    const list = await this.repo.find({ where: { statut } });
    return list.map(ChargeMapper.toDomain);
  }

  async findValidesParProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<Charge[]> {
    const list = await this.repo.find({
      where: { projetId, periode, statut: StatutDeclaration.VALIDE },
    });
    return list.map(ChargeMapper.toDomain);
  }
}
