import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  CreerProjetProps,
  ProjectFactory,
} from 'src/catalog/domain/factories/project.factory';
import { ProjetPublieDomainEvent } from 'src/catalog/domain/events/projet-publie.domain-event';
import { SlugProjetDejaPrisError } from 'src/catalog/domain/errors';
import { Project } from 'src/catalog/domain/aggregates/project';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';

/**
 * Création d'un projet par l'administration.
 *
 * Le use case orchestre, il ne décide pas : la fabrique pose le slug, le statut
 * de départ et les défauts, les Value Objects éprouvent les montants et les
 * dates. Ne restent ici que les deux choses qu'un agrégat ne peut pas savoir
 * seul — l'unicité du slug, qui suppose de lire la table, et la publication du
 * fait métier.
 *
 * Il recevait jusqu'ici `CreateProjectDto`, c'est-à-dire un objet de la couche
 * **présentation** : la flèche de dépendance allait à l'envers (§1), et le
 * même DTO servait de contrat d'entrée à la création comme à la mise à jour.
 * L'entrée est désormais {@link CreerProjetProps}, un type du domaine ; c'est
 * le contrôleur qui traduit la requête HTTP.
 */
@Injectable()
export class CreateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(props: CreerProjetProps): Promise<Project> {
    const projet = ProjectFactory.creer(props);

    const homonyme = await this.projectRepository.findProjectBySlug(
      projet.slug,
    );
    if (homonyme) throw new SlugProjetDejaPrisError(projet.slug);

    const enregistre = await this.projectRepository.saveProject(projet);

    // Un brouillon n'est visible de personne : rien à annoncer tant qu'il n'a
    // pas passé la due diligence.
    if (!enregistre.estBrouillon()) {
      this.eventBus.publish(
        new ProjetPublieDomainEvent(
          enregistre.id,
          enregistre.slug,
          enregistre.titre,
          enregistre.type,
          enregistre.statut,
          enregistre.ville,
          enregistre.localisation.libelleCourt,
        ),
      );
    }

    return enregistre;
  }
}
