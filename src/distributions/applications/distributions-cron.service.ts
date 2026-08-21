import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CalculateDistributionPeriodeUseCase } from './usecases/calculate-distribution-periode.usecase';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from 'src/catalog/domain/repositories/project.repository';
import { ModeleEconomique } from 'src/catalog/domain/enums/modele-economique.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';

/**
 * Cron mensuel — calcule la distribution du mois précédent pour tous les
 * projets equity-locatif en FINANCE.
 *
 * Tourne le 5 du mois à 9h (configurable via env DISTRIBUTION_CRON_DAY).
 *
 * Idempotent : si une période existe déjà pour un (projet, mois précédent),
 * le calcul est skippé pour ce projet (le use-case throw ConflictException
 * qu'on attrape).
 */
@Injectable()
export class DistributionsCronService {
  private readonly logger = new Logger(DistributionsCronService.name);

  constructor(
    private readonly calculateUseCase: CalculateDistributionPeriodeUseCase,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
  ) {}

  // Tous les 5 du mois à 9h
  @Cron('0 0 9 5 * *', { name: 'distributions-monthly-calc' })
  async monthlyCalculation(): Promise<void> {
    const now = new Date();
    const moisPrec = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periode = `${moisPrec.getFullYear()}-${String(moisPrec.getMonth() + 1).padStart(2, '0')}`;
    this.logger.log(`Démarrage calcul mensuel distributions pour ${periode}`);
    await this.run(periode);
  }

  /**
   * Méthode utilisable directement (sans cron) — utilisée par l'endpoint
   * admin `POST /admin/distributions/calculate-all/:periode`.
   */
  async run(periode: string): Promise<{
    nbProjets: number;
    nbSucces: number;
    nbErreurs: number;
    erreurs: Array<{ projetId: string; raison: string }>;
  }> {
    const { data: projets } = await this.projectRepo.findAllProjects({
      statut: ProjectStatus.FINANCE,
    });
    const eligibles = projets.filter(
      (p) => p.modeleEconomique === ModeleEconomique.EQUITY,
    );
    this.logger.log(
      `${eligibles.length}/${projets.length} projets éligibles (EQUITY + FINANCE) pour période ${periode}`,
    );

    let nbSucces = 0;
    const erreurs: Array<{ projetId: string; raison: string }> = [];

    for (const projet of eligibles) {
      try {
        await this.calculateUseCase.execute(projet.id, periode);
        nbSucces++;
      } catch (err: any) {
        const raison = err?.message ?? String(err);
        erreurs.push({ projetId: projet.id, raison });
        this.logger.warn(
          `Calcul échoué pour projet ${projet.id} période ${periode}: ${raison}`,
        );
      }
    }

    this.logger.log(
      `Cron distributions terminé : ${nbSucces}/${eligibles.length} succès, ${erreurs.length} erreurs.`,
    );
    return {
      nbProjets: eligibles.length,
      nbSucces,
      nbErreurs: erreurs.length,
      erreurs,
    };
  }
}
