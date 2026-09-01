import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { TransactionStatus } from 'src/wallets/domains/enums/wallet.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Phase 10 — AML monitoring (stub).
 *
 * Surveille les mouvements de fonds suspicieux selon des seuils simples :
 * - Transaction unique > AML_THRESHOLD_SINGLE
 * - Cumul mensuel par utilisateur > AML_THRESHOLD_MONTHLY
 *
 * Quand un seuil est dépassé :
 *   - Crée un audit log structuré (action `aml.threshold-exceeded`)
 *   - Notifie les admins COMPLIANCE/RCCI/FINANCIER
 *
 * Stub : à brancher sur les use-cases qui créent des transactions importantes
 * (souscription, exécution distribution, exécution sortie). L'intégration
 * d'un vrai vendor AML (SumSub, Veriff, ComplyAdvantage) viendra en Phase 11.
 */

const AML_THRESHOLD_SINGLE = Number(process.env.AML_THRESHOLD_SINGLE ?? 10_000); // EUR
const AML_THRESHOLD_MONTHLY = Number(process.env.AML_THRESHOLD_MONTHLY ?? 50_000);

/** Fenêtre du cumul « mensuel » : 30 jours glissants, pas le mois civil. */
const AML_FENETRE_CUMUL_JOURS = 30;

export interface AmlContext {
  userId: number;
  amount: number;
  context:
    | 'depot'
    | 'souscription'
    | 'distribution'
    | 'sortie'
    | 'retrait'
    | 'marche-secondaire';
  reference?: string; // ID de la transaction concernée
  /**
   * Cumul déjà connu de l'appelant. À NE PAS renseigner en temps normal : le
   * service le calcule lui-même (voir `cumulMensuel`). Le paramètre n'est
   * conservé que pour les tests et pour un appelant qui disposerait d'un
   * agrégat plus juste que la lecture générique.
   */
  cumulMensuel?: number;
}

@Injectable()
export class AmlMonitorService {
  private readonly logger = new Logger(AmlMonitorService.name);

  constructor(
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly metrics: MetricsPort,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /**
   * Évalue un mouvement contre les seuils LCB-FT.
   *
   * NON BLOQUANT par construction : une alerte relève de la vigilance (art.
   * L.561-10 et s. CMF), pas du gel des avoirs. Le flux se poursuit ; ce sont
   * les équipes compliance qui décident de la suite. Toute erreur interne est
   * absorbée — un incident de surveillance ne doit jamais empêcher un
   * investisseur de déposer, retirer ou souscrire.
   */
  async check(ctx: AmlContext): Promise<void> {
    const alerts: string[] = [];
    if (ctx.amount > AML_THRESHOLD_SINGLE) {
      alerts.push(`single>${AML_THRESHOLD_SINGLE}`);
    }

    // Le cumul est calculé ICI, jamais attendu de l'appelant : la surveillance
    // du cumul n'a de valeur que si elle est SYSTÉMATIQUE. Tant qu'elle
    // dépendait d'un champ optionnel que personne ne remplissait, le seuil
    // mensuel n'était jamais évalué — le fractionnement d'un montant en
    // plusieurs opérations sous le seuil unitaire (« smurfing »), soit
    // exactement ce que ce contrôle doit détecter, passait inaperçu.
    const cumulMensuel = ctx.cumulMensuel ?? (await this.cumulMensuel(ctx.userId));
    if (cumulMensuel != null && cumulMensuel > AML_THRESHOLD_MONTHLY) {
      alerts.push(`monthly>${AML_THRESHOLD_MONTHLY}`);
    }

    if (alerts.length === 0) return;

    const motif = alerts.join(', ');
    this.logger.warn(
      `AML threshold exceeded for user=${ctx.userId} amount=${ctx.amount} ctx=${ctx.context} alerts=[${motif}]`,
    );

    // Une émission par règle déclenchée (single/monthly) — jamais l'userId ni
    // le montant en label (cardinalité, cf. metric-names.ts).
    for (const alert of alerts) {
      this.metrics.incrementCounter(METRIC.AML_THRESHOLD_EXCEEDED_TOTAL, {
        context: ctx.context,
        rule: alert.startsWith('single') ? 'single' : 'monthly',
      });
    }

    await this.auditLog
      .create(
        String(ctx.userId),
        UserRole.INVESTISSEUR,
        'aml.threshold-exceeded',
        ctx.context,
        ctx.reference,
        undefined,
        undefined,
        {
          amount: ctx.amount,
          cumulMensuel,
          alerts,
          thresholdSingle: AML_THRESHOLD_SINGLE,
          thresholdMonthly: AML_THRESHOLD_MONTHLY,
        },
      )
      .catch(() => {});

    await this.notificationService
      .pushToAdmins({
        type: NotificationType.SECURITE,
        titre: 'Alerte AML : seuil dépassé',
        message: `User #${ctx.userId} — ${ctx.context} ${ctx.amount.toLocaleString('fr-FR')} (${motif})`,
        roles: [UserRole.COMPLIANCE, UserRole.RCCI, UserRole.FINANCIER, UserRole.SUPER_ADMIN],
        metadata: {
          userId: ctx.userId,
          amount: ctx.amount,
          context: ctx.context,
          reference: ctx.reference,
          alerts,
          cumulMensuel,
        },
      })
      .catch(() => {});
  }

  /**
   * Volume total des mouvements RÉUSSIS impliquant le portefeuille de
   * l'utilisateur sur les 30 derniers jours.
   *
   * Choix explicites :
   *  - fenêtre GLISSANTE et non mois civil : un fractionnement à cheval sur
   *    deux mois échapperait sinon au contrôle le 1er de chaque mois ;
   *  - entrées ET sorties confondues : la circulation de fonds est ce qui
   *    intéresse la vigilance, pas le solde net ;
   *  - mouvements intra-portefeuille exclus (source = destination, tel un
   *    blocage d'escrow) : ils ne font entrer ni sortir aucun euro et
   *    gonfleraient artificiellement le cumul ;
   *  - statut REUSSI seul : une opération échouée n'a déplacé aucun fonds.
   *
   * Renvoie `null` si le cumul n'a pas pu être établi (utilisateur sans
   * portefeuille, incident base) — l'absence de mesure ne doit pas se lire
   * comme un cumul nul, et surtout pas faire échouer le flux appelant.
   */
  private async cumulMensuel(userId: number): Promise<number | null> {
    try {
      const wallets = await this.walletRepo.find({
        where: { proprietaireUserId: userId },
        select: ['id'],
      });
      if (wallets.length === 0) return null;
      const walletIds = wallets.map((w) => w.id);

      const depuis = new Date(
        Date.now() - AML_FENETRE_CUMUL_JOURS * 24 * 60 * 60 * 1000,
      );

      const raw = await this.txRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.montant), 0)', 'total')
        .where('t.statut = :statut', { statut: TransactionStatus.REUSSI })
        .andWhere('t.createdAt >= :depuis', { depuis })
        .andWhere(
          '(t.walletSource IN (:...walletIds) OR t.walletDestination IN (:...walletIds))',
          { walletIds },
        )
        .andWhere(
          '(t.walletSource IS NULL OR t.walletDestination IS NULL OR t.walletSource <> t.walletDestination)',
        )
        .getRawOne<{ total: string }>();

      return Number(raw?.total ?? 0);
    } catch (err) {
      this.logger.warn(
        `Cumul LCB-FT non calculable pour l'utilisateur #${userId} — seuil mensuel non évalué : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
