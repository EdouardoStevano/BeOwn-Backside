import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FiltresProjets,
  ProjectRepository,
} from 'src/catalog/domain/repositories/project.repository';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { Project } from 'src/catalog/domain/aggregates/project';
import { ProjectEntity } from '../persistence/entities/project.entity';
import { ProjectOrmMapper } from '../persistence/mappers/project.orm-mapper';

@Injectable()
export class TypeOrmProjectRepository implements ProjectRepository {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
  ) {}

  async saveProject(project: Project): Promise<Project> {
    const saved = await this.projectRepo.save(
      ProjectOrmMapper.toEntity(project),
    );
    return ProjectOrmMapper.toDomain(saved);
  }

  async findProjectById(id: string): Promise<Project | null> {
    const entity = await this.projectRepo.findOne({ where: { id } });
    return entity ? ProjectOrmMapper.toDomain(entity) : null;
  }

  async findProjectBySlug(slug: string): Promise<Project | null> {
    const entity = await this.projectRepo.findOne({ where: { slug } });
    return entity ? ProjectOrmMapper.toDomain(entity) : null;
  }

  async findAllProjects(
    filters?: FiltresProjets,
  ): Promise<{ data: Project[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const qb = this.projectRepo.createQueryBuilder('p');
    if (filters?.statuts?.length) {
      qb.andWhere('p.statut IN (:...statuts)', { statuts: filters.statuts });
    } else if (filters?.statut) {
      qb.andWhere('p.statut = :statut', { statut: filters.statut });
    }
    if (filters?.type) qb.andWhere('p.type = :type', { type: filters.type });
    if (filters?.porteurId != null) {
      qb.andWhere('p.porteurId = :porteurId', { porteurId: filters.porteurId });
    }
    qb.orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [entities, total] = await qb.getManyAndCount();
    return { data: entities.map(ProjectOrmMapper.toDomain), total };
  }

  async findProjectIdsByStatuts(statuts: ProjectStatus[]): Promise<string[]> {
    if (statuts.length === 0) return [];
    const lignes = await this.projectRepo
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p.statut IN (:...statuts)', { statuts })
      .getRawMany<{ id: string }>();
    return lignes.map((ligne) => ligne.id);
  }

  /**
   * `UPDATE` ciblé de la seule colonne `statut`.
   *
   * Ne pose plus `datePublication` ni `dateOuvertureCollecte` : estampiller des
   * jalons métier était une décision du domaine prise ici (§1). Elle appartient
   * à `Project.changerStatut`, et le chemin nominal — `UpdateProjectStatusUseCase`
   * — enregistre désormais l'agrégat entier.
   *
   * La méthode reste au port pour les transitions techniques qui n'ont pas
   * d'agrégat sous la main.
   */
  async updateProjectStatus(
    id: string,
    status: ProjectStatus,
  ): Promise<Project> {
    await this.projectRepo.update(id, { statut: status });
    const updated = await this.projectRepo.findOneOrFail({ where: { id } });
    return ProjectOrmMapper.toDomain(updated);
  }
}
