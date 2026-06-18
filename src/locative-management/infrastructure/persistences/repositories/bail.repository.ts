import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bail } from '../../../domains/bail';
import { BailRepository } from '../../../applications/ports/repositories/bail.repository';
import { BailEntity } from '../entities/bail.entity';
import { UniteLouableEntity } from '../entities/unite-louable.entity';
import { BailMapper } from '../mappers/bail.mapper';
import { StatutBail } from '../../../domains/enums/statut-bail.enum';

@Injectable()
export class BailTypeOrmRepository implements BailRepository {
  constructor(
    @InjectRepository(BailEntity)
    private readonly repo: Repository<BailEntity>,
  ) {}

  async save(b: Bail): Promise<Bail> {
    return BailMapper.toDomain(await this.repo.save(BailMapper.toEntity(b)));
  }

  async findById(id: string): Promise<Bail | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? BailMapper.toDomain(f) : null;
  }

  async findByUniteLouable(uniteLouableId: string): Promise<Bail[]> {
    const list = await this.repo.find({ where: { uniteLouableId } });
    return list.map(BailMapper.toDomain);
  }

  async findActifsByProjet(projetId: string): Promise<Bail[]> {
    const list = await this.repo
      .createQueryBuilder('b')
      .innerJoin(UniteLouableEntity, 'u', 'u.id = b.uniteLouableId')
      .where('u.projetId = :projetId', { projetId })
      .andWhere('b.statut = :statut', { statut: StatutBail.ACTIF })
      .getMany();
    return list.map(BailMapper.toDomain);
  }
}
