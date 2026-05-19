import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DistributionPart } from '../../../domains/distribution-part';
import { DistributionPartRepository } from '../../../applications/ports/repositories/distribution-part.repository';
import { DistributionPartEntity } from '../entities/distribution-part.entity';
import { DistributionPartMapper } from '../mappers/distribution-part.mapper';

@Injectable()
export class DistributionPartTypeOrmRepository
  implements DistributionPartRepository
{
  constructor(
    @InjectRepository(DistributionPartEntity)
    private readonly repo: Repository<DistributionPartEntity>,
  ) {}

  async saveAll(parts: DistributionPart[]): Promise<DistributionPart[]> {
    const entities = parts.map(DistributionPartMapper.toEntity);
    const saved = await this.repo.save(entities);
    return saved.map(DistributionPartMapper.toDomain);
  }

  async findByPeriode(
    periodeDistributionId: string,
  ): Promise<DistributionPart[]> {
    const list = await this.repo.find({ where: { periodeDistributionId } });
    return list.map(DistributionPartMapper.toDomain);
  }

  async findByInvestissement(
    investissementId: string,
  ): Promise<DistributionPart[]> {
    const list = await this.repo.find({
      where: { investissementId },
      order: { createdAt: 'DESC' },
    });
    return list.map(DistributionPartMapper.toDomain);
  }

  async findUnpaid(): Promise<DistributionPart[]> {
    const list = await this.repo.find({ where: { payeLe: IsNull() } });
    return list.map(DistributionPartMapper.toDomain);
  }

  async markPaid(id: string, payeLe: Date): Promise<void> {
    await this.repo.update({ id }, { payeLe });
  }
}
