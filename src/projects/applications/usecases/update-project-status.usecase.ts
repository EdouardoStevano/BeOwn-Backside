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
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

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
    private readonly notificationService: NotificationService,
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

    const updated = await this.projectRepository.updateProjectStatus(
      projectId,
      newStatus,
    );

    if (newStatus === ProjectStatus.EN_COLLECTE) {
      const lieu = [updated.ville, updated.pays].filter(Boolean).join(', ');
      this.notificationService
        .pushToInvestors({
          type: NotificationType.NOUVEAU_PROJET,
          titre: "Projet ouvert à l'investissement",
          message: lieu
            ? `« ${updated.titre} » (${lieu}) est ouvert à l'investissement.`
            : `« ${updated.titre} » est ouvert à l'investissement.`,
          metadata: {
            projectId: updated.id,
            slug: updated.slug,
            statut: updated.statut,
            ville: updated.ville,
            type: updated.type,
          },
        })
        .then((results) => {
          this.logger.log(
            `Notified ${results.length} investor(s) about project ${updated.id} (${updated.titre})`,
          );
        })
        .catch((err) =>
          this.logger.warn(
            `Notification fan-out failed for project ${projectId}: ${err?.message ?? err}`,
          ),
        );
    }

    return updated;
  }
}
