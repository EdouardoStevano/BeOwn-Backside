import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../ports/repositories/project.repository';
import type { ProjectRepository } from '../ports/repositories/project.repository';
import { Project } from 'src/projects/domains/project';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

@Injectable()
export class GetProjectsUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(filters?: {
    statut?: ProjectStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: Project[]; total: number }> {
    return this.projectRepository.findAllProjects(filters);
  }

  async executeOne(id: string): Promise<Project | null> {
    return this.projectRepository.findProjectById(id);
  }

  async executeBySlug(slug: string): Promise<Project | null> {
    return this.projectRepository.findProjectBySlug(slug);
  }
}
