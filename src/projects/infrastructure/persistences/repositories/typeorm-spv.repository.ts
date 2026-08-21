import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpvRepository } from 'src/projects/applications/ports/repositories/spv.repository';
import { Spv } from 'src/projects/domains/spv';
import { SpvEntity } from '../entities/spv.entity';
import { SpvOrmMapper } from '../mappers/spv.orm-mapper';

@Injectable()
export class TypeOrmSpvRepository implements SpvRepository {
  constructor(
    @InjectRepository(SpvEntity)
    private readonly spvRepo: Repository<SpvEntity>,
  ) {}

  async saveSpv(spv: Spv): Promise<Spv> {
    const saved = await this.spvRepo.save(SpvOrmMapper.toEntity(spv));
    return SpvOrmMapper.toDomain(saved);
  }

  async findSpvById(id: string): Promise<Spv | null> {
    const entity = await this.spvRepo.findOne({ where: { id } });
    return entity ? SpvOrmMapper.toDomain(entity) : null;
  }

  async findAllSpv(): Promise<Spv[]> {
    const entities = await this.spvRepo.find();
    return entities.map(SpvOrmMapper.toDomain);
  }
}
