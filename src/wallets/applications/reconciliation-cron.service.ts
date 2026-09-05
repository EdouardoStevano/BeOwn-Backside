import { Injectable, Logger, Optional} from '@nestjs/common';
import { VerrouCronService } from 'src/common/cron/verrou-cron.service';
import { Cron } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

/**
 * Déclencheur quotidien de la réconciliation financière.
 *
 * 5h30, tous les jours : après la fenêtre nocturne où les traitements par lots
 * (clôtures de collecte, distributions, échéances) ont fini d'écrire, et AVANT
 * l'ouverture des équipes — pour que l'écart éventuel soit déjà sur leur
 * bureau à leur arrivée plutôt que découvert en fin de journée.
 *
 * Ce service ne contient AUCUNE règle : il ne fait qu'ordonnancer. Toute la
 * logique de contrôle est dans `ReconciliationService`, qui reste appelable
 * à la demande depuis le back-office — le même code sert les deux chemins
 * (SRP : une raison de changer pour l'horaire, une autre pour la règle).
 */
@Injectable()
export class ReconciliationCronService {
  private readonly logger = new Logger(ReconciliationCronService.name);

  constructor(
    private readonly reconciliation: ReconciliationService,
    // Verrou distribué, OPTIONNEL et en dernière position : `@Cron` s'exécute
    // dans CHAQUE réplique. Son absence fait retomber sur le comportement
    // antérieur (exécuter), jamais sur un échec.
    @Optional() private readonly verrouCron?: VerrouCronService,
  ) {}

  /**
   * Point d'entrée planifié : n'exécute le balayage que si le verrou
   * distribué est obtenu. Derrière un HPA, six répliques déclenchent
   * sinon le même travail à la même seconde, sur les mêmes lignes.
   */
  @Cron('0 30 5 * * *', { name: 'reconciliation-grand-livre' })
  async reconcilierQuotidiennement(): Promise<void> {
    if (!this.verrouCron) return this.executerReconcilierQuotidiennement();
    await this.verrouCron.executerSiSeul('wallets:reconciliation', () =>
      this.executerReconcilierQuotidiennement(),
    );
  }

  async executerReconcilierQuotidiennement(): Promise<void> {
    try {
      const rapport = await this.reconciliation.reconcilier();
      this.logger.log(
        `CRON réconciliation : ${rapport.nbWallets} portefeuilles, ` +
          `${rapport.nbEcritures} écritures, ` +
          `${rapport.ecarts.length} écart(s) portefeuille — ` +
          `${rapport.equilibre ? 'équilibré' : 'NON équilibré'}.`,
      );
    } catch (err: any) {
      // Un cron ne fait JAMAIS tomber le process : une exception non rattrapée
      // dans un handler planifié devient une `unhandledRejection` et peut tuer
      // le pod. L'échec est journalisé avec sa pile ; l'absence de mise à jour
      // de la jauge de fraîcheur (posée en fin de réconciliation réussie)
      // suffit à déclencher l'alerte « la réconciliation ne tourne plus ».
      this.logger.error(
        `CRON réconciliation en échec : ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
