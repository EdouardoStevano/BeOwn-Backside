import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Locataire } from '../../../domains/locataire';
import { LocataireRepository } from '../../../applications/ports/repositories/locataire.repository';
import { LocataireEntity } from '../entities/locataire.entity';
import { LocataireMapper } from '../mappers/locataire.mapper';

@Injectable()
export class LocataireTypeOrmRepository implements LocataireRepository {
  constructor(
    @InjectRepository(LocataireEntity)
    private readonly repo: Repository<LocataireEntity>,
  ) {}

  async save(loc: Locataire): Promise<Locataire> {
    const e = LocataireMapper.toEntity(loc);
    return LocataireMapper.toDomain(await this.repo.save(e));
  }

  async findById(id: string): Promise<Locataire | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? LocataireMapper.toDomain(f) : null;
  }

  async findBySpv(spvId: string): Promise<Locataire[]> {
    const list = await this.repo.find({ where: { spvId } });
    return list.map(LocataireMapper.toDomain);
  }
}
