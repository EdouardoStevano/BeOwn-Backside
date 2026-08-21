import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { CollecteOuverteDomainEvent } from 'src/projects/domains/events/collecte-ouverte.domain-event';
import { ProjetAnnonceDomainEvent } from 'src/projects/domains/events/projet-annonce.domain-event';
import { ProjetIntrouvableError } from 'src/projects/domains/errors';
import { Project } from 'src/projects/domains/project';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../ports/repositories/project.repository';

/**
 * Changement de statut d'un projet.
 *
 * Le use case portait trois choses qui ne lui appartenaient pas : la table des
 * transitions (constante de module, désormais dans `StatutProjet`), et deux
 * appels directs à `BroadcastService` — le contexte Notifications — enveloppés
 * dans des `void … .catch(…)` pour que la transition survive à une panne de
 * diffusion.
 *
 * Ces deux appels deviennent des faits métier publiés sur le bus (§8). Le
 * découplage n'est pas cosmétique : la transition et les campagnes qui la
 * suivent avaient des raisons de changer différentes, et le « fire-and-forget »
 * était la manière d'admettre que la seconde ne devait jamais faire échouer la
 * première. Un abonné qui échoue n'échoue plus qu'auprès de lui-même — le bus
 * publie de façon synchrone mais n'attend pas les réactions, et
 * `EventBus.publish` ne rejette pas.
 *
 * Les jalons de publication (`datePublication`, `dateOuvertureCollecte`), que
 * le repository TypeORM estampillait de son côté, sont posés par
 * {@link Project.changerStatut} — le projet est donc enregistré entier plutôt
 * que par un `UPDATE` de la seule colonne `statut`.
 */
@Injectable()
export class UpdateProjectStatusUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    projectId: string,
    nouveauStatut: ProjectStatus,
    declenchePar: number,
  ): Promise<Project> {
    const projet = await this.projectRepository.findProjectById(projectId);
    if (!projet) throw new ProjetIntrouvableError();

    projet.changerStatut(nouveauStatut);
    const enregistre = await this.projectRepository.saveProject(projet);

    if (nouveauStatut === ProjectStatus.EN_COLLECTE) {
      this.eventBus.publish(
        new CollecteOuverteDomainEvent(enregistre.id, declenchePar),
      );
    } else if (nouveauStatut === ProjectStatus.ANNONCE) {
      this.eventBus.publish(
        new ProjetAnnonceDomainEvent(enregistre.id, declenchePar),
      );
    }

    return enregistre;
  }
}
