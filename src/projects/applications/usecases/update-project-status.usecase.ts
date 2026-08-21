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
import { decrireVerdict, verifierFici } from 'src/projects/domains/fici';

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

    this.assertFiciPubliable(project, newStatus);

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

    if (newStatus === ProjectStatus.ANNONCE) {
      // Diffusion « réservations ouvertes » : le PATCH générique de statut est
      // un second chemin vers ANNONCE, en plus du bouton publish-annonce
      // (AdminProjectActionsController). Les deux déclenchent la même
      // campagne ; le claim atomique sur broadcastAnnonceAt garantit qu'un
      // projet passé par les deux chemins ne diffuse qu'une seule fois.
      void this.broadcast
        .announceReservationOpened(updated.id, triggeredBy)
        .catch((err) =>
          this.logger.warn(
            `Diffusion « ouverture de réservation » échouée pour le projet ${projectId}: ${err?.message ?? err}`,
          ),
        );
    }

    return updated;
  }

  /**
   * Art. 23 : la fiche d'informations clés est mise à disposition des
   * investisseurs potentiels AVANT qu'ils puissent s'engager. Le contrôle
   * couvre donc aussi le pré-investissement : une réservation est un
   * engagement, même si la collecte n'est pas formellement ouverte.
   */
  private assertFiciPubliable(project: Project, newStatus: ProjectStatus): void {
    const statutsExigeantFici: ProjectStatus[] = [
      ProjectStatus.PRE_INVESTISSEMENT,
      ProjectStatus.EN_COLLECTE,
    ];
    if (!statutsExigeantFici.includes(newStatus)) return;

    if (!project.fici) {
      throw new BadRequestException(
        "Aucune fiche d'informations clés sur l'investissement n'est renseignée pour " +
          "ce projet. L'article 23 du règlement (UE) 2020/1503 impose de la mettre à " +
          "disposition des investisseurs avant toute possibilité d'engagement.",
      );
    }

    const verdict = verifierFici(project.fici);
    if (!verdict.valide) {
      throw new BadRequestException(
        `Fiche d'informations clés incomplète. ${decrireVerdict(verdict)}`,
      );
    }
  }
}
