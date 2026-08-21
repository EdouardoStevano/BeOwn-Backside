import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { ProjetReconsulteDomainEvent } from 'src/catalog/domain/events/projet-reconsulte.domain-event';
import {
  PROJECT_VIEW_REPOSITORY,
  type ProjectViewRepository,
} from '../../../domain/repositories/project-view.repository';

/**
 * Trace une consultation du détail d'un projet, et lève un fait métier au
 * passage à la deuxième — le signal d'intérêt qu'attend le chargé de relation.
 *
 * Vivait dans une méthode privée de `ProjectController`, qui injectait pour
 * cela un `Repository<ProjectViewEntity>` TypeORM (§12.9) et appelait
 * `NotificationService` en direct.
 *
 * **Entièrement non bloquant**, et c'est intentionnel : le traçage est du
 * best-effort, il ne doit jamais empêcher un investisseur de consulter une
 * fiche. Le `try/catch` muet de l'ancien code est conservé, mais il trace
 * désormais — un échec silencieux sur un compteur qu'on ne regarde jamais est
 * un compteur qu'on croit à tort exact.
 */
@Injectable()
export class RecordProjectViewUseCase {
  private readonly logger = new Logger(RecordProjectViewUseCase.name);

  /** Seuil à partir duquel la consultation devient un signal commercial. */
  private static readonly SEUIL_ALERTE = 2;

  constructor(
    @Inject(PROJECT_VIEW_REPOSITORY)
    private readonly projectViewRepository: ProjectViewRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    utilisateurId: number,
    projetId: string,
    projetTitre: string,
  ): Promise<void> {
    try {
      const nbConsultations =
        await this.projectViewRepository.enregistrerEtCompter(
          utilisateurId,
          projetId,
        );

      // Strictement au passage du seuil : alerter à chaque visite suivante
      // noierait le signal.
      if (nbConsultations === RecordProjectViewUseCase.SEUIL_ALERTE) {
        this.eventBus.publish(
          new ProjetReconsulteDomainEvent(
            projetId,
            projetTitre,
            utilisateurId,
            nbConsultations,
          ),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Consultation du projet ${projetId} par l'utilisateur ${utilisateurId} non tracée — la fiche a bien été servie.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
