import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortieProjet, StatutSortie } from '../../../domains/sortie-projet';
import { SortieProjetRepository } from '../../../applications/ports/repositories/sortie-projet.repository';
import { SortieProjetEntity } from '../entities/sortie-projet.entity';
import { SortieProjetMapper } from '../mappers/sortie-projet.mapper';

@Injectable()
export class SortieProjetTypeOrmRepository implements SortieProjetRepository {
  constructor(
    @InjectRepository(SortieProjetEntity)
    private readonly repo: Repository<SortieProjetEntity>,
  ) {}

  async save(s: SortieProjet): Promise<SortieProjet> {
    return SortieProjetMapper.toDomain(
      await this.repo.save(SortieProjetMapper.toEntity(s)),
    );
  }

  async findById(id: string): Promise<SortieProjet | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? SortieProjetMapper.toDomain(f) : null;
  }

  async findByProjet(projetId: string): Promise<SortieProjet[]> {
    const list = await this.repo.find({
      where: { projetId },
      order: { createdAt: 'DESC' },
    });
    return list.map(SortieProjetMapper.toDomain);
  }

  async findByStatut(statut: StatutSortie): Promise<SortieProjet[]> {
    const list = await this.repo.find({ where: { statut } });
    return list.map(SortieProjetMapper.toDomain);
  }
}
