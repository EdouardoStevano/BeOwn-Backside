import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortieProjetRepository } from 'src/catalog/domain/repositories/sortie-projet.repository';
import { StatutSortie } from 'src/catalog/domain/enums/statut-sortie.enum';
import { SortieProjet } from 'src/catalog/domain/aggregates/sortie-projet';
import { SortieProjetEntity } from '../persistence/entities/sortie-projet.entity';
import { SortieProjetOrmMapper } from '../persistence/mappers/sortie-projet.orm-mapper';

@Injectable()
export class TypeOrmSortieProjetRepository implements SortieProjetRepository {
  constructor(
    @InjectRepository(SortieProjetEntity)
    private readonly repo: Repository<SortieProjetEntity>,
  ) {}

  async save(sortie: SortieProjet): Promise<SortieProjet> {
    return SortieProjetOrmMapper.toDomain(
      await this.repo.save(SortieProjetOrmMapper.toEntity(sortie)),
    );
  }

  async findById(id: string): Promise<SortieProjet | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? SortieProjetOrmMapper.toDomain(entity) : null;
  }

  async findByProjet(projetId: string): Promise<SortieProjet[]> {
    const entities = await this.repo.find({
      where: { projetId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(SortieProjetOrmMapper.toDomain);
  }

  async findByStatut(statut: StatutSortie): Promise<SortieProjet[]> {
    const entities = await this.repo.find({ where: { statut } });
    return entities.map(SortieProjetOrmMapper.toDomain);
  }
}
