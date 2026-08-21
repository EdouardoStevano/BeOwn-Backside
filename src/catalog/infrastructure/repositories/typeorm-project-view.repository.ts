import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectViewRepository } from 'src/catalog/domain/repositories/project-view.repository';
import { ProjectViewEntity } from '../persistence/entities/project-view.entity';

@Injectable()
export class TypeOrmProjectViewRepository implements ProjectViewRepository {
  constructor(
    @InjectRepository(ProjectViewEntity)
    private readonly repo: Repository<ProjectViewEntity>,
  ) {}

  async enregistrerEtCompter(
    utilisateurId: number,
    projetId: string,
  ): Promise<number> {
    await this.repo.save(this.repo.create({ userId: utilisateurId, projetId }));
    return this.repo.count({ where: { userId: utilisateurId, projetId } });
  }
}
