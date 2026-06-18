import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UniteLouable } from '../../../domains/unite-louable';
import { UniteLouableRepository } from '../../../applications/ports/repositories/unite-louable.repository';
import { UniteLouableEntity } from '../entities/unite-louable.entity';
import { UniteLouableMapper } from '../mappers/unite-louable.mapper';

@Injectable()
export class UniteLouableTypeOrmRepository implements UniteLouableRepository {
  constructor(
    @InjectRepository(UniteLouableEntity)
    private readonly repo: Repository<UniteLouableEntity>,
  ) {}

  async save(u: UniteLouable): Promise<UniteLouable> {
    const e = UniteLouableMapper.toEntity(u);
    return UniteLouableMapper.toDomain(await this.repo.save(e));
  }

  async findById(id: string): Promise<UniteLouable | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? UniteLouableMapper.toDomain(f) : null;
  }

  async findByProjet(projetId: string): Promise<UniteLouable[]> {
    const list = await this.repo.find({ where: { projetId } });
    return list.map(UniteLouableMapper.toDomain);
  }
}
