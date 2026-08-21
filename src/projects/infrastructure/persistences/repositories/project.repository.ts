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

  /**
   * La société support est jointe (`relations: { spv: true }`) : le contrat de
   * souscription doit imprimer la dénomination de la SCI émettrice, que
   * `spvId` seul ne fournissait pas. ManyToOne → une seule jointure, aucun
   * appel supplémentaire. `spv.iban` est `select: false` et ne remonte donc pas.
   */
  async findProjectById(id: string): Promise<Project | null> {
    const entity = await this.projectRepo.findOne({
      where: { id },
      relations: { spv: true },
    });
    return entity ? ProjectMapper.toDomain(entity) : null;
  }

  async findProjectBySlug(slug: string): Promise<Project | null> {
    const entity = await this.projectRepo.findOne({
      where: { slug },
      relations: { spv: true },
    });
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
    // Jointure unique pour toute la page : la dénomination de la société
    // support est disponible en liste sans une requête par projet (N+1).
    qb.leftJoinAndSelect('p.spv', 'spv');
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

  async findOffresPorteurDepuis(
    porteurId: number,
    depuis: Date,
    exclureProjetId?: string,
  ): Promise<{ montant: number; ouverteLe: Date }[]> {
    const qb = this.projectRepo
      .createQueryBuilder('p')
      .select(['p.capitalCible AS montant', 'p.dateOuvertureCollecte AS "ouverteLe"'])
      .where('p.porteurId = :porteurId', { porteurId })
      .andWhere('p.dateOuvertureCollecte IS NOT NULL')
      .andWhere('p.dateOuvertureCollecte >= :depuis', { depuis })
      // Une offre annulée ou en échec n'a pas mobilisé le plafond du porteur.
      .andWhere('p.statut NOT IN (:...exclus)', {
        exclus: [ProjectStatus.ANNULE, ProjectStatus.ECHEC],
      });

    if (exclureProjetId) {
      qb.andWhere('p.id != :exclureProjetId', { exclureProjetId });
    }

    const rows = await qb.getRawMany<{ montant: string; ouverteLe: Date }>();
    return rows.map((row) => ({
      montant: Number(row.montant),
      ouverteLe: new Date(row.ouverteLe),
    }));
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
