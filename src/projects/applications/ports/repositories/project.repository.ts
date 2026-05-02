import { Project } from 'src/projects/domains/project';
import { Spv } from 'src/projects/domains/spv';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface ProjectRepository {
  saveProject(project: Project): Promise<Project>;
  findProjectById(id: string): Promise<Project | null>;
  findProjectBySlug(slug: string): Promise<Project | null>;
  findAllProjects(filters?: {
    statut?: ProjectStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: Project[]; total: number }>;
  updateProject(project: Project): Promise<Project>;
  updateProjectStatus(id: string, status: ProjectStatus): Promise<Project>;

  saveSpv(spv: Spv): Promise<Spv>;
  findSpvById(id: string): Promise<Spv | null>;
  findAllSpv(): Promise<Spv[]>;
}
