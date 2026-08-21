import { Inject, Injectable } from '@nestjs/common';
import {
  ProjetIntrouvableError,
  SlugProjetDejaPrisError,
} from 'src/catalog/domain/errors';
import { ModificationProjet, Project } from 'src/catalog/domain/aggregates/project';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';

/**
 * Mise à jour des champs d'un projet.
 *
 * Le use case tenait auparavant quarante `if (dto.x !== undefined)` — la liste
 * complète des champs, recopiée à côté de celle de la création, avec trois
 * `(dto as any)` pour atteindre des champs absents du DTO et un défaut `'CI'`
 * là où la création posait `'FR'`. Tout cela appartient à l'agrégat : c'est lui
 * qui sait quels champs se contraignent entre eux, et
 * {@link Project.modifier} revalide chaque bloc touché **entier**.
 *
 * Ne reste ici que ce qui suppose de lire la table : l'existence du projet, et
 * l'unicité du slug quand la mise à jour le change — un contrôle que l'ancienne
 * version ne faisait pas, si bien qu'un `PATCH` pouvait viser un slug déjà pris
 * et remonter une violation de contrainte Postgres en 500.
 */
@Injectable()
export class UpdateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(
    id: string,
    modification: ModificationProjet,
  ): Promise<Project> {
    const projet = await this.projectRepository.findProjectById(id);
    if (!projet) throw new ProjetIntrouvableError();

    if (modification.slug !== undefined && modification.slug !== projet.slug) {
      const homonyme = await this.projectRepository.findProjectBySlug(
        modification.slug,
      );
      if (homonyme && homonyme.id !== id) {
        throw new SlugProjetDejaPrisError(modification.slug);
      }
    }

    projet.modifier(modification);
    return this.projectRepository.saveProject(projet);
  }
}
