import { Project } from 'src/projects/domains/project';
import {
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface FiltresProjets {
  statut?: ProjectStatus;
  statuts?: ProjectStatus[];
  type?: ProjectType;
  porteurId?: number;
  page?: number;
  limit?: number;
}

/**
 * Accès aux projets, vu depuis le domaine.
 *
 * Le port ne porte plus que les projets : les trois méthodes de SPV
 * (`saveSpv`, `findSpvById`, `findAllSpv`) vivaient ici et obligeaient tout
 * consommateur — Investments, Reservations, Distributions, Locative Management,
 * qui ne lisent que des projets — à dépendre d'un contrat qu'ils n'utilisent
 * pas (§4, ISP). Elles sont passées à {@link SpvRepository}.
 *
 * `updateProject` est partie avec elles : aucun appelant, et un doublon exact
 * de `saveProject`.
 */
export interface ProjectRepository {
  saveProject(project: Project): Promise<Project>;
  findProjectById(id: string): Promise<Project | null>;
  findProjectBySlug(slug: string): Promise<Project | null>;
  findAllProjects(
    filters?: FiltresProjets,
  ): Promise<{ data: Project[]; total: number }>;

  /**
   * Identifiants seuls des projets dans l'un des statuts donnés.
   *
   * Pour la résolution d'un lien de partage : le jeton est un condensat de
   * l'identifiant, donc non inversible, et le seul moyen de retrouver le projet
   * est de recalculer le condensat de chaque candidat.
   * `ProjectController.findByShareToken` chargeait pour cela **mille projets
   * entiers** (`limit: 1000`) — un plafond au-delà duquel les liens cessaient
   * silencieusement de fonctionner, et une page complète de données pour n'en
   * garder qu'un identifiant.
   */
  findProjectIdsByStatuts(statuts: ProjectStatus[]): Promise<string[]>;

  updateProjectStatus(id: string, status: ProjectStatus): Promise<Project>;
}
