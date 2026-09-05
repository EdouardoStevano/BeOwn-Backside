import { Injectable, Logger, Optional} from '@nestjs/common';
import { VerrouCronService } from 'src/common/cron/verrou-cron.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { formatEur } from 'src/shared/money/format-eur';
import { StripeConnectService } from '../infrastructure/stripe-connect.service';
import { RetraitSettlementService } from './services/retrait-settlement.service';

/**
 * Délai au-delà duquel un retrait encore `en_cours` mérite d'être vérifié.
 * Quinze minutes : très au-delà de la latence normale d'un webhook Stripe
 * (quelques secondes), assez court pour qu'un investisseur ne voie pas son
 * retrait « en cours » une journée entière après son arrivée en banque.
 */
export const DELAI_VERIFICATION_MINUTES = 15;

/**
 * Délai au-delà duquel un retrait `en_cours` SANS identifiant de payout cesse
 * d'être une anomalie passagère. Il n'y a alors plus rien à interroger : ni la
 * base ni Stripe ne savent où est l'argent, seul un humain peut trancher.
 */
export const DELAI_ALERTE_SANS_PAYOUT_JOURS = 7;

/** Nombre de retraits examinés par passage — borne la charge d'un balayage. */
const TAILLE_LOT = 200;

/** Ce qu'un balayage a réellement fait. */
export interface ResultatBalayageRetraits {
  /** Retraits examinés (somme exacte des quatre issues suivantes). */
  verifies: number;
  /** Retraits passés à REUSSI parce que le payout était `paid`. */
  clos: number;
  /** Retraits recrédités parce que le payout avait échoué ou été annulé. */
  compenses: number;
  /** Retraits laissés en l'état (payout encore en vol, lecture impossible…). */
  laisses: number;
  /** Retraits escaladés au financier — une seule fois par retrait. */
  alertes: number;
}

/**
 * Rattrapage des retraits dont le sort est connu chez le prestataire mais
 * inconnu de la plateforme.
 *
 * POURQUOI CE BALAYAGE EXISTE : la clôture d'un retrait ne reposait que sur le
 * webhook `payout.*`. Un webhook non reçu — endpoint injoignable, abonnement
 * expiré, environnement de développement sans tunnel, incident réseau — laisse
 * le retrait `en_cours` POUR TOUJOURS alors que l'argent est arrivé sur le
 * compte du bénéficiaire. Constat fait en base : quatre retraits `en_cours`
 * dont les quatre payouts Stripe étaient `paid`. Aucun chemin interne ne
 * pouvait les clore, et aucune alerte ne le signalait — l'investisseur voit un
 * retrait « en cours » indéfiniment, et le suivi financier compte un montant en
 * vol qui n'existe plus.
 *
 * CE QU'IL FAIT : il interroge Stripe de sa propre initiative et rejoue la
 * séquence de clôture EXACTEMENT comme le webhook l'aurait fait — même service
 * (`RetraitSettlementService`), mêmes gardes d'idempotence. Un webhook tardif
 * qui arrive après un balayage (ou l'inverse) est donc un no-op.
 *
 * CE QU'IL NE FAIT PAS : il ne devine jamais. Un payout encore `pending` ou
 * `in_transit` est laissé tel quel ; une lecture Stripe qui échoue ne conclut
 * rien ; un retrait sans identifiant de payout n'est pas recrédité mais
 * escaladé à un humain. Sur un chemin argent, l'inaction est toujours plus sûre
 * qu'une écriture décidée sur une information incomplète.
 */
@Injectable()
export class RetraitsReaperService {
  private readonly logger = new Logger(RetraitsReaperService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly stripeConnect: StripeConnectService,
    private readonly settlement: RetraitSettlementService,
    private readonly notificationService: NotificationService,
    // Verrou distribué, OPTIONNEL et en dernière position : `@Cron`
    // s'exécute dans CHAQUE réplique. Son absence fait retomber sur le
    // comportement antérieur (exécuter), jamais sur un échec.
    @Optional() private readonly verrouCron?: VerrouCronService,
  ) {}

  /**
   * Point d'entrée planifié : n'exécute le balayage que si le verrou
   * distribué est obtenu. Derrière un HPA, six répliques déclenchent
   * sinon le même travail à la même seconde, sur les mêmes lignes.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'retraits-reaper' })
  async balayerRetraitsEnCours(): Promise<void> {
    if (!this.verrouCron) return this.executerBalayerRetraitsEnCours();
    await this.verrouCron.executerSiSeul('payments:retraits-reaper', () =>
      this.executerBalayerRetraitsEnCours(),
    );
  }

  async executerBalayerRetraitsEnCours(): Promise<void> {
    try {
      const resultat = await this.reap();
      if (resultat.verifies === 0) {
        this.logger.debug('CRON retraits-reaper : aucun retrait à vérifier.');
        return;
      }
      this.logger.log(
        `CRON retraits-reaper : ${resultat.verifies} retrait(s) vérifié(s) — ` +
          `${resultat.clos} clos, ${resultat.compenses} compensé(s), ` +
          `${resultat.laisses} laissé(s), ${resultat.alertes} alerte(s).`,
      );
    } catch (err: any) {
      // Un cron ne fait jamais tomber le processus.
      this.logger.error(
        `CRON retraits-reaper : balayage interrompu — ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }

  /**
   * Exécution utilisable hors ordonnanceur (endpoint admin, test, rattrapage).
   * `maintenant` est injectable pour rendre les seuils testables sans horloge.
   */
  async reap(maintenant: Date = new Date()): Promise<ResultatBalayageRetraits> {
    const limiteVerification = new Date(
      maintenant.getTime() - DELAI_VERIFICATION_MINUTES * 60 * 1000,
    );
    const limiteAlerte = new Date(
      maintenant.getTime() - DELAI_ALERTE_SANS_PAYOUT_JOURS * 24 * 60 * 60 * 1000,
    );

    const candidats = await this.txRepo.find({
      where: {
        type: TransactionType.RETRAIT,
        statut: TransactionStatus.EN_COURS,
        createdAt: LessThanOrEqual(limiteVerification),
      },
      order: { createdAt: 'ASC' },
      take: TAILLE_LOT,
    });

    const resultat: ResultatBalayageRetraits = {
      verifies: 0,
      clos: 0,
      compenses: 0,
      laisses: 0,
      alertes: 0,
    };

    for (const tx of candidats) {
      resultat.verifies += 1;
      try {
        const issue = await this.traiterRetrait(tx, limiteAlerte);
        resultat[issue] += 1;
      } catch (err: any) {
        // Un retrait en échec ne doit pas empêcher le traitement des suivants.
        resultat.laisses += 1;
        this.logger.error(
          `CRON retraits-reaper : échec sur le retrait ${tx.id} — ${err?.message ?? err}`,
        );
      }
    }

    return resultat;
  }

  /** Sort d'UN retrait — l'issue nomme la case du compteur à incrémenter. */
  private async traiterRetrait(
    tx: TransactionEntity,
    limiteAlerte: Date,
  ): Promise<'clos' | 'compenses' | 'laisses' | 'alertes'> {
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    const payoutId = typeof meta.payoutId === 'string' ? meta.payoutId : null;
    const connectedAccountId =
      typeof meta.connectedAccountId === 'string' ? meta.connectedAccountId : null;

    if (!payoutId) {
      // Rien à interroger : ni la base ni Stripe ne disent où est l'argent.
      // On n'écrit AUCUN mouvement — un recrédit à l'aveugle paierait
      // potentiellement deux fois — on escalade, une seule fois.
      if (tx.createdAt > limiteAlerte) return 'laisses';
      if (meta.alerteReaper) return 'laisses';
      await this.alerterRetraitSansPayout(tx, meta);
      return 'alertes';
    }

    const payout = await this.stripeConnect.retrievePayout(payoutId, connectedAccountId);
    if (!payout) {
      // Une lecture qui échoue ne prouve rien : le retrait reste en l'état.
      return 'laisses';
    }

    // `metadata.retraitTxId` est posé à la création du payout, mais on ne s'en
    // remet pas à Stripe pour identifier NOTRE transaction : c'est la ligne en
    // base qui nous a menés à ce payout, le rattachement est donc certain.
    const payoutRattache = {
      ...payout,
      metadata: { ...(payout.metadata ?? {}), retraitTxId: tx.id },
    };

    if (payout.status === 'paid') {
      const issue = await this.settlement.cloturerRetraitPaye(
        payoutRattache,
        connectedAccountId ?? undefined,
      );
      return issue === 'clos' ? 'clos' : 'laisses';
    }

    if (payout.status === 'failed' || payout.status === 'canceled') {
      const echoue = payout.status === 'failed';
      const issue = await this.settlement.denouerPayoutNonAbouti(
        payoutRattache,
        connectedAccountId ?? undefined,
        {
          evenement: `reaper.payout.${payout.status}`,
          motif: echoue
            ? `Payout Stripe échoué (payout=${payout.id})`
            : `Payout Stripe annulé (payout=${payout.id})`,
          statutFinal: echoue ? TransactionStatus.ECHOUE : TransactionStatus.ANNULE,
          declencheurMetrique: echoue ? 'payout_failed' : 'payout_canceled',
        },
      );
      return issue === 'compense' ? 'compenses' : 'laisses';
    }

    // `pending`, `in_transit` : le versement est encore en vol, rien à décider.
    return 'laisses';
  }

  /**
   * Escalade d'un retrait ancien dont on ne sait pas retrouver le versement.
   * Marquée dans les metadata pour n'être émise qu'UNE fois : une alerte qui se
   * répète toutes les heures cesse d'être lue.
   */
  private async alerterRetraitSansPayout(
    tx: TransactionEntity,
    meta: Record<string, unknown>,
  ): Promise<void> {
    // Fusion CIBLÉE dans `metadata`, calculée par la base. Un `save` de
    // l'entière ligne, construit depuis une lecture antérieure et hors verrou,
    // écrasait tout ce qu'un autre processus avait posé entre-temps — au
    // premier chef `recredited`, le drapeau qui empêche un second crédit. Le
    // balayeur tourne précisément sur des retraits qu'un webhook peut être en
    // train de dénouer : c'est le pire endroit pour réécrire une ligne entière.
    await this.txRepo
      .createQueryBuilder()
      .update(TransactionEntity)
      .set({
        metadata: () => `COALESCE(metadata, '{}'::jsonb) || :ajout::jsonb`,
      })
      .setParameter(
        'ajout',
        JSON.stringify({
          alerteReaper: {
            raison: 'payout_absent',
            detecteLe: new Date().toISOString(),
          },
        }),
      )
      .where('id = :id', { id: tx.id })
      .execute();

    this.logger.error(
      `Retrait ${tx.id} en cours depuis plus de ${DELAI_ALERTE_SANS_PAYOUT_JOURS} jours ` +
        'sans identifiant de payout — escalade financière.',
    );

    await this.notificationService
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Retrait bloqué sans versement identifiable',
        message:
          `Le retrait ${tx.id} (${formatEur(Number(tx.montant))}) est « en cours » depuis plus de ` +
          `${DELAI_ALERTE_SANS_PAYOUT_JOURS} jours et ne porte aucun identifiant de versement : ` +
          "impossible d'en vérifier le sort chez le prestataire. Le portefeuille n'a PAS été " +
          'recrédité, pour ne pas payer deux fois. Vérifier l\'état Stripe avant toute régularisation.',
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          transactionId: tx.id,
          montant: Number(tx.montant),
          devise: tx.devise,
          createdAt: tx.createdAt,
        },
      })
      .catch(() => {});
  }
}
