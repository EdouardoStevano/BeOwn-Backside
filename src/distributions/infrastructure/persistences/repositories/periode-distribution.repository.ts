import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodeDistribution } from '../../../domains/periode-distribution';
import { PeriodeDistributionRepository } from '../../../applications/ports/repositories/periode-distribution.repository';
import { PeriodeDistributionEntity } from '../entities/periode-distribution.entity';
import { PeriodeDistributionMapper } from '../mappers/periode-distribution.mapper';
import { StatutPeriodeDistribution } from '../../../domains/enums/statut-periode-distribution.enum';

@Injectable()
export class PeriodeDistributionTypeOrmRepository
  implements PeriodeDistributionRepository
{
  constructor(
    @InjectRepository(PeriodeDistributionEntity)
    private readonly repo: Repository<PeriodeDistributionEntity>,
  ) {}

  async save(p: PeriodeDistribution): Promise<PeriodeDistribution> {
    return PeriodeDistributionMapper.toDomain(
      await this.repo.save(PeriodeDistributionMapper.toEntity(p)),
    );
  }

  async findById(id: string): Promise<PeriodeDistribution | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? PeriodeDistributionMapper.toDomain(f) : null;
  }

  async findByProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<PeriodeDistribution | null> {
    const f = await this.repo.findOne({ where: { projetId, periode } });
    return f ? PeriodeDistributionMapper.toDomain(f) : null;
  }

  async findByStatut(
    statut: StatutPeriodeDistribution,
  ): Promise<PeriodeDistribution[]> {
    const list = await this.repo.find({ where: { statut } });
    return list.map(PeriodeDistributionMapper.toDomain);
  }

  async findHistoriqueByProjet(
    projetId: string,
  ): Promise<PeriodeDistribution[]> {
    const list = await this.repo.find({
      where: { projetId },
      order: { periode: 'DESC' },
    });
    return list.map(PeriodeDistributionMapper.toDomain);
  }
}
