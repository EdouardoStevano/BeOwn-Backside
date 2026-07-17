import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../ports/repositories/project.repository';
import type { ProjectRepository } from '../ports/repositories/project.repository';
import { Project } from 'src/projects/domains/project';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { BroadcastService } from 'src/notifications/applications/broadcast.service';

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
  private readonly logger = new Logger(UpdateProjectStatusUseCase.name);

  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly broadcast: BroadcastService,
  ) {}

  async execute(
    projectId: string,
    newStatus: ProjectStatus,
    triggeredBy: number,
  ): Promise<Project> {
    const project = await this.projectRepository.findProjectById(projectId);
    if (!project) throw new NotFoundException('Projet introuvable.');

    const allowed = ALLOWED_TRANSITIONS[project.statut] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transition invalide de ${project.statut} vers ${newStatus}.`,
      );
    }

    const updated = await this.projectRepository.updateProjectStatus(
      projectId,
      newStatus,
    );

    if (newStatus === ProjectStatus.EN_COLLECTE) {
      // Diffusion « nouveau projet » en fire-and-forget : elle remplace
      // l'ancien fan-out in-app brut (tous les investisseurs, quel que soit
      // leur statut). BroadcastService pousse la notif in-app aux comptes
      // ACTIFS, ajoute email/SMS selon les préférences et les toggles admin,
      // dédoublonne via un horodatage sur le projet et n'échoue jamais.
      void this.broadcast
        .announceProjectLaunched(updated.id, triggeredBy)
        .catch((err) =>
          this.logger.warn(
            `Diffusion « nouveau projet » échouée pour le projet ${projectId}: ${err?.message ?? err}`,
          ),
        );
    }

    return updated;
  }
}
