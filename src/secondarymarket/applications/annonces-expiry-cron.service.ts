import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { jourLimiteValidite } from 'src/secondarymarket/domains/tableau-affichage';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Retrait quotidien des annonces dont la date de validité est dépassée.
 *
 * La colonne `valideJusquAu` était saisissable par le vendeur mais lue nulle
 * part : une annonce « valable jusqu'au 31 août » restait indéfiniment au
 * carnet, sollicitable et cessible. Deux verrous complémentaires la ferment
 * désormais — le filtre de la liste publique et le refus d'expression
 * d'intérêt, qui appliquent la règle en temps réel — et ce balayage, qui rend
 * l'état de l'annonce conforme à ce qu'elle affiche.
 *
 * Le passage en `EXPIRE` libère aussi les fractions immobilisées : elles
 * cessent d'être comptées comme engagées et le vendeur peut republier.
 */
@Injectable()
export class AnnoncesExpiryCronService {
  private readonly logger = new Logger(AnnoncesExpiryCronService.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsPort,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async expirerAnnoncesEchues(): Promise<number> {
    const jourLimite = jourLimiteValidite(new Date());

    // Seules les annonces encore au carnet sont concernées : une annonce déjà
    // sollicitée, acceptée ou exécutée relève du parcours de cession, pas de la
    // péremption d'une offre publiée.
    const echues = await this.ordreRepo
      .createQueryBuilder('ord')
      .where('ord.statut = :statut', { statut: OrdreMarcheStatus.EN_CARNET })
      .andWhere('ord."valideJusquAu" IS NOT NULL')
      .andWhere('ord."valideJusquAu" < :jourLimite', { jourLimite })
      .getMany();

    if (echues.length === 0) {
      this.logger.debug('CRON annonces-expiry: aucune annonce échue');
      return 0;
    }

    let expirees = 0;
    for (const ordre of echues) {
      try {
        // Transition conditionnelle : une annonce qui vient de recevoir une
        // marque d'intérêt entre la lecture et l'écriture n'est pas retirée
        // sous les pieds de son acheteur.
        const transition = await this.ordreRepo
          .createQueryBuilder()
          .update(OrdreMarcheEntity)
          .set({ statut: OrdreMarcheStatus.EXPIRE })
          .where('id = :id AND statut = :enCarnet', {
            id: ordre.id,
            enCarnet: OrdreMarcheStatus.EN_CARNET,
          })
          .execute();
        if (!transition.affected) continue;

        expirees += 1;
        this.metrics.incrementCounter(METRIC.SECONDARY_ORDERS_TOTAL, {
          action: 'expired',
        });

        await this.notifications
          .push({
            utilisateurId: ordre.vendeurId,
            type: NotificationType.MARCHE_SECONDAIRE,
            titre: 'Votre annonce a expiré',
            message:
              `Votre annonce de ${ordre.nbFractions} fraction(s) a atteint sa date de validité ` +
              "et a été retirée du tableau d'affichage. Vos fractions vous restent acquises : " +
              'vous pouvez republier une annonce à tout moment.',
            metadata: { ordreId: ordre.id, nbFractions: ordre.nbFractions },
          })
          .catch(() => {});
      } catch (err: any) {
        // Une annonce en échec ne doit pas arrêter le balayage des suivantes.
        this.logger.error(
          `CRON annonces-expiry: échec sur l'annonce ${ordre.id}: ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `CRON annonces-expiry: ${expirees}/${echues.length} annonce(s) passée(s) en expire`,
    );
    return expirees;
  }
}
