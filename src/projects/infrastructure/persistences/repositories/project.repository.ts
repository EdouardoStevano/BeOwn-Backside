import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { Project } from 'src/projects/domains/project';
import { Spv } from 'src/projects/domains/spv';
import {
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import { ProjectEntity } from '../entities/project.entity';
import { SpvEntity } from '../entities/spv.entity';
import { ProjectMapper } from '../mappers/project.mapper';

@Injectable()
export class ProjectTypeOrmRepository implements ProjectRepository {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SpvEntity)
    private readonly spvRepo: Repository<SpvEntity>,
  ) {}

  async saveProject(project: Project): Promise<Project> {
    const entity = ProjectMapper.toEntity(project);
    const saved = await this.projectRepo.save(entity);
    return ProjectMapper.toDomain(saved);
  }

  async findProjectById(id: string): Promise<Project | null> {
    const entity = await this.projectRepo.findOne({ where: { id } });
    return entity ? ProjectMapper.toDomain(entity) : null;
  }

  async findProjectBySlug(slug: string): Promise<Project | null> {
    const entity = await this.projectRepo.findOne({ where: { slug } });
    return entity ? ProjectMapper.toDomain(entity) : null;
  }

  async findAllProjects(filters?: {
    statut?: ProjectStatus;
    statuts?: ProjectStatus[];
    type?: ProjectType;
    porteurId?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: Project[]; total: number }> {
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
    return { data: entities.map(ProjectMapper.toDomain), total };
  }

  async updateProject(project: Project): Promise<Project> {
    const entity = ProjectMapper.toEntity(project);
    const saved = await this.projectRepo.save(entity);
    return ProjectMapper.toDomain(saved);
  }

  async updateProjectStatus(
    id: string,
    status: ProjectStatus,
  ): Promise<Project> {
    const updateData: Partial<ProjectEntity> = { statut: status };
    if (
      status === ProjectStatus.ANNONCE ||
      status === ProjectStatus.EN_COLLECTE
    ) {
      updateData.datePublication = new Date();
    }
    if (status === ProjectStatus.EN_COLLECTE) {
      updateData.dateOuvertureCollecte = new Date();
    }
    await this.projectRepo.update(id, updateData);
    const updated = await this.projectRepo.findOneOrFail({ where: { id } });
    return ProjectMapper.toDomain(updated);
  }

  async saveSpv(spv: Spv): Promise<Spv> {
    const entity = ProjectMapper.spvToEntity(spv);
    const saved = await this.spvRepo.save(entity);
    return ProjectMapper.spvToDomain(saved);
  }

  async findSpvById(id: string): Promise<Spv | null> {
    const entity = await this.spvRepo.findOne({ where: { id } });
    return entity ? ProjectMapper.spvToDomain(entity) : null;
  }

  async findAllSpv(): Promise<Spv[]> {
    const entities = await this.spvRepo.find();
    return entities.map(ProjectMapper.spvToDomain);
  }
}
