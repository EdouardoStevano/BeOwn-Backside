import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../ports/repositories/project.repository';
import type { ProjectRepository } from '../ports/repositories/project.repository';
import { Project } from 'src/projects/domains/project';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.BROUILLON]: [ProjectStatus.ANNONCE, ProjectStatus.ANNULE],
  [ProjectStatus.ANNONCE]: [
    ProjectStatus.PRE_INVESTISSEMENT,
    ProjectStatus.EN_COLLECTE,
    ProjectStatus.ANNULE,
  ],
  [ProjectStatus.PRE_INVESTISSEMENT]: [
    ProjectStatus.EN_COLLECTE,
    ProjectStatus.ANNULE,
  ],
  [ProjectStatus.EN_COLLECTE]: [ProjectStatus.FINANCE, ProjectStatus.ECHEC],
  [ProjectStatus.FINANCE]: [ProjectStatus.EN_EXPLOITATION],
  [ProjectStatus.EN_EXPLOITATION]: [
    ProjectStatus.CLOTURE,
    ProjectStatus.ANNULE,
  ],
  [ProjectStatus.CLOTURE]: [],
  [ProjectStatus.ECHEC]: [],
  [ProjectStatus.ANNULE]: [],
};

@Injectable()
export class UpdateProjectStatusUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(projectId: string, newStatus: ProjectStatus): Promise<Project> {
    const project = await this.projectRepository.findProjectById(projectId);
    if (!project) throw new NotFoundException('Projet introuvable.');

    const allowed = ALLOWED_TRANSITIONS[project.statut] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transition invalide de ${project.statut} vers ${newStatus}.`,
      );
    }

    return this.projectRepository.updateProjectStatus(projectId, newStatus);
  }
}
