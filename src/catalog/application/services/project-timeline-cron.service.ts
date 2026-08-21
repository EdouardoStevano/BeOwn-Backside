import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../domain/repositories/project.repository';

/**
 * Fait avancer chaque matin la chronologie des projets ouverts.
 *
 * Le service injectait un `Repository<ProjectEntity>` TypeORM et écrivait
 * lui-même la comparaison avant/après (§12.3) ; la règle d'avancement vivait à
 * côté, en fonction libre dans `applications/chronologie-status.ts`. Les deux
 * appartiennent au domaine — voir `Chronologie` et
 * {@link Project.avancerChronologieAu} — et le service n'a plus qu'à balayer et
 * enregistrer ce qui a bougé.
 */
@Injectable()
export class ProjectTimelineCronService {
  private readonly logger = new Logger(ProjectTimelineCronService.name);

  /**
   * Un projet terminé n'avance plus : sa chronologie est un historique.
   */
  private static readonly STATUTS_FIGES: readonly ProjectStatus[] = [
    ProjectStatus.ANNULE,
    ProjectStatus.CLOTURE,
    ProjectStatus.ECHEC,
  ];

  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  @Cron('0 6 * * *')
  async advanceTimelines(): Promise<void> {
    const aujourdhui = new Date();
    const enCours = Object.values(ProjectStatus).filter(
      (statut) => !ProjectTimelineCronService.STATUTS_FIGES.includes(statut),
    );

    // Le balayage est volontairement non paginé : il porte sur la totalité des
    // projets vivants, comme le `find()` qu'il remplace.
    const { data: projets } = await this.projectRepository.findAllProjects({
      statuts: enCours,
      page: 1,
      limit: Number.MAX_SAFE_INTEGER,
    });

    let misAJour = 0;
    for (const projet of projets) {
      if (!projet.avancerChronologieAu(aujourdhui)) continue;
      try {
        await this.projectRepository.saveProject(projet);
        misAJour++;
      } catch (err) {
        // Un projet qui résiste ne doit pas priver les autres de leur mise à
        // jour : le balayage continue, l'incident est tracé.
        this.logger.warn(
          `Chronologie du projet ${projet.id} non avancée.`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(`CRON chronologie: ${misAJour} projet(s) mis à jour`);
  }
}
