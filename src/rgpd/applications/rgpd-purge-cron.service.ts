import { Injectable, Logger, Optional} from '@nestjs/common';
import { VerrouCronService } from 'src/common/cron/verrou-cron.service';
import { Cron } from '@nestjs/schedule';
import { RgpdPurgeService } from 'src/rgpd/applications/rgpd-purge.service';

/**
 * Déclencheur quotidien de la purge RGPD.
 *
 * 3h45 : heure creuse, AVANT le nettoyage des dépôts abandonnés (4h00) et la
 * réconciliation financière (5h30) — la purge ne touche ni wallet ni écriture
 * comptable, mais autant qu'elle ait fini d'écrire quand la réconciliation
 * balaie le grand livre.
 *
 * Ce service ne contient AUCUNE règle : il ne fait qu'ordonnancer (même
 * partage que ReconciliationCronService). Toute la logique vit dans
 * `RgpdPurgeService`, également appelable à la demande via
 * `POST /admin/rgpd/purge/run` — le même code sert les deux chemins.
 */
@Injectable()
export class RgpdPurgeCronService {
  private readonly logger = new Logger(RgpdPurgeCronService.name);

  constructor(private readonly purge: RgpdPurgeService,
    // Verrou distribué, OPTIONNEL et en dernière position : `@Cron`
    // s'exécute dans CHAQUE réplique. Son absence fait retomber sur le
    // comportement antérieur (exécuter), jamais sur un échec.
    @Optional() private readonly verrouCron?: VerrouCronService,) {}

  /**
   * Point d'entrée planifié : n'exécute le balayage que si le verrou
   * distribué est obtenu. Derrière un HPA, six répliques déclenchent
   * sinon le même travail à la même seconde, sur les mêmes lignes.
   */
  @Cron('0 45 3 * * *', { name: 'rgpd-purge' })
  async purgerQuotidiennement(): Promise<void> {
    if (!this.verrouCron) return this.executerPurgerQuotidiennement();
    await this.verrouCron.executerSiSeul('rgpd:purge', () =>
      this.executerPurgerQuotidiennement(),
    );
  }

  async executerPurgerQuotidiennement(): Promise<void> {
    try {
      const rapport = await this.purge.purger();
      this.logger.log(
        `CRON purge RGPD : ${rapport.totalTraites} ligne(s)/compte(s) traité(s) ` +
          `sur ${rapport.compteurs.length} finalité(s).`,
      );
    } catch (err: any) {
      // Un cron ne fait JAMAIS tomber le process (même règle que la
      // réconciliation) : l'échec est journalisé avec sa pile ; les sélections
      // étant auto-extinctives, le run suivant rattrape le stock.
      this.logger.error(
        `CRON purge RGPD en échec : ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
