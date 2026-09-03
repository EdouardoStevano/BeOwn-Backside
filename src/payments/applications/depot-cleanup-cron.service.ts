import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

/** Au-delà de ce délai, un dépôt resté INITIE ne se conclura plus. */
export const DELAI_ABANDON_DEPOT_JOURS = 7;

/** Motif inscrit sur les dépôts clôturés d'office. */
export const MOTIF_DEPOT_ABANDONNE = 'abandonne';

/**
 * Clôture d'office les dépôts restés au statut INITIE.
 *
 * POURQUOI : un dépôt initié puis abandonné (fenêtre de paiement fermée, 3-D
 * Secure non terminé, application quittée) reste indéfiniment INITIE. Ces
 * lignes ne représentent aucun mouvement de fonds, mais elles polluent
 * durablement l'historique de l'investisseur — qui y lit un paiement « en
 * cours » depuis des mois — et les écrans de suivi financier, où l'on ne
 * distingue plus un abandon ancien d'un paiement réellement en attente.
 *
 * Un délai de sept jours est très au-delà de la durée de vie d'un
 * PaymentIntent : passé ce point, l'absence de `payment_intent.succeeded` ne
 * peut plus être un retard de webhook.
 *
 * PÉRIMÈTRE VOLONTAIREMENT ÉTROIT : seuls les mouvements de type DEPOT sont
 * touchés. Les autres transactions peuvent naître INITIE par d'autres chemins
 * (écriture créée à la main par un administrateur, par exemple) et ne relèvent
 * pas de cette règle. Aucun solde n'est modifié : un dépôt INITIE n'a jamais
 * rien crédité, le clôturer ne déplace pas un euro.
 */
@Injectable()
export class DepotCleanupCronService {
  private readonly logger = new Logger(DepotCleanupCronService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  // Tous les jours à 4h00, avant la réconciliation financière de 5h30.
  @Cron('0 0 4 * * *', { name: 'depot-cleanup-initie' })
  async closeAbandonedDeposits(): Promise<void> {
    try {
      const resultat = await this.run();
      if (resultat.nbClotures === 0) {
        this.logger.debug('CRON depot-cleanup : aucun dépôt abandonné.');
        return;
      }
      this.logger.log(
        `CRON depot-cleanup : ${resultat.nbClotures} dépôt(s) INITIE de plus de ` +
        `${DELAI_ABANDON_DEPOT_JOURS} jours passés en ECHOUE (motif « ${MOTIF_DEPOT_ABANDONNE} »).`,
      );
    } catch (err: any) {
      // Un cron ne fait jamais tomber le processus.
      this.logger.error(
        `CRON depot-cleanup : échec du nettoyage — ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }

  /**
   * Exécution utilisable hors ordonnanceur (test, rattrapage manuel).
   * Une seule requête `UPDATE ... WHERE` : aucune ligne n'est chargée en
   * mémoire, et le nombre de dépôts en attente n'a pas d'incidence.
   */
  async run(maintenant: Date = new Date()): Promise<{ nbClotures: number }> {
    const limite = new Date(
      maintenant.getTime() - DELAI_ABANDON_DEPOT_JOURS * 24 * 60 * 60 * 1000,
    );

    const resultat = await this.txRepo.update(
      {
        type: TransactionType.DEPOT,
        statut: TransactionStatus.INITIE,
        createdAt: LessThan(limite),
      },
      {
        statut: TransactionStatus.ECHOUE,
        motifEchec: MOTIF_DEPOT_ABANDONNE,
      },
    );

    return { nbClotures: resultat.affected ?? 0 };
  }
}
