import { Project } from 'src/projects/domains/project';
import { Spv } from 'src/projects/domains/spv';
import {
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface ProjectRepository {
  saveProject(project: Project): Promise<Project>;
  findProjectById(id: string): Promise<Project | null>;
  findProjectBySlug(slug: string): Promise<Project | null>;
  findAllProjects(filters?: {
    statut?: ProjectStatus;
    statuts?: ProjectStatus[];
    type?: ProjectType;
    porteurId?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: Project[]; total: number }>;
  updateProject(project: Project): Promise<Project>;
  updateProjectStatus(id: string, status: ProjectStatus): Promise<Project>;

  /**
   * Offres déjà ouvertes au public par un porteur depuis `depuis`, pour le
   * contrôle du plafond de 5 M€ sur douze mois glissants (art. 1(2)(c) du
   * règlement (UE) 2020/1503). Les brouillons non ouverts sont exclus, un
   * projet peut être exclu par son identifiant lors d'une mise à jour.
   */
  findOffresPorteurDepuis(
    porteurId: number,
    depuis: Date,
    exclureProjetId?: string,
  ): Promise<{ montant: number; ouverteLe: Date }[]>;

  saveSpv(spv: Spv): Promise<Spv>;
  findSpvById(id: string): Promise<Spv | null>;
  findAllSpv(): Promise<Spv[]>;
}
