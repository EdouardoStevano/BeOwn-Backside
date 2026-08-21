import { Inject, Injectable } from '@nestjs/common';
import { Project } from 'src/catalog/domain/aggregates/project';
import {
  FiltresProjets,
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';

/**
 * Lecture des projets — liste paginée, unité par identifiant, unité par slug.
 *
 * Côté lecture, on ne passe pas par l'agrégat pour appliquer des règles : ces
 * trois méthodes traversent le repository sans rien décider (§7). Elles
 * existent pour donner un point d'entrée applicatif unique aux quatre
 * contrôleurs et au composeur de read-model, plutôt que de les laisser injecter
 * le port chacun de leur côté.
 */
@Injectable()
export class GetProjectsUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(
    filters?: FiltresProjets,
  ): Promise<{ data: Project[]; total: number }> {
    return this.projectRepository.findAllProjects(filters);
  }

  async executeOne(id: string): Promise<Project | null> {
    return this.projectRepository.findProjectById(id);
  }

  async executeBySlug(slug: string): Promise<Project | null> {
    return this.projectRepository.findProjectBySlug(slug);
  }
}
