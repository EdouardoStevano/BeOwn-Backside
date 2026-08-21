import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import {
  CreerProjetProps,
  ProjectFactory,
} from 'src/projects/domains/factories/project.factory';
import { ProjetSoumisDomainEvent } from 'src/projects/domains/events/projet-soumis.domain-event';
import { SlugProjetDejaPrisError } from 'src/projects/domains/errors';
import { Project } from 'src/projects/domains/project';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../ports/repositories/project.repository';

/** Ce qu'un porteur soumet : son dossier, sans le statut ni le rattachement. */
export type SoumettreProjetProps = Omit<
  CreerProjetProps,
  'statut' | 'porteurId'
>;

/**
 * Soumission d'un dossier par un porteur, pour revue.
 *
 * Distinct de {@link CreateProjectUseCase}, et pas seulement par l'événement
 * qu'il lève : **un porteur ne contrôle ni le statut ni la visibilité de son
 * dossier**. Le statut `BROUILLON` et le rattachement à son compte sont posés
 * ici, hors de portée de l'entrée. `ProjectController.submitByPorteur` s'en
 * chargeait par un `{ ...dto, statut: BROUILLON }` juste avant d'appeler la
 * création — une garde de la couche présentation, donc absente de tout autre
 * point d'entrée (§12.5).
 */
@Injectable()
export class SubmitProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    props: SoumettreProjetProps,
    porteurId: number,
  ): Promise<Project> {
    const projet = ProjectFactory.creer({
      ...props,
      porteurId,
      statut: ProjectStatus.BROUILLON,
    });

    const homonyme = await this.projectRepository.findProjectBySlug(
      projet.slug,
    );
    if (homonyme) throw new SlugProjetDejaPrisError(projet.slug);

    const enregistre = await this.projectRepository.saveProject(projet);

    this.eventBus.publish(
      new ProjetSoumisDomainEvent(
        enregistre.id,
        enregistre.slug,
        enregistre.titre,
        enregistre.type,
        porteurId,
        enregistre.ville,
        enregistre.localisation.libelleCourt,
      ),
    );

    return enregistre;
  }
}
