import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

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

export interface AmlContext {
  userId: number;
  amount: number;
  context:
    | 'souscription'
    | 'distribution'
    | 'sortie'
    | 'retrait'
    | 'marche-secondaire';
  reference?: string; // ID de la transaction concernée
  cumulMensuel?: number;
}

@Injectable()
export class AmlMonitorService {
  private readonly logger = new Logger(AmlMonitorService.name);

  constructor(
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Évalue une transaction contre les seuils AML. Non-bloquant : juste log
   * + notification si dépassement.
   */
  async check(ctx: AmlContext): Promise<void> {
    const alerts: string[] = [];
    if (ctx.amount > AML_THRESHOLD_SINGLE) {
      alerts.push(`single>${AML_THRESHOLD_SINGLE}`);
    }
    if (ctx.cumulMensuel != null && ctx.cumulMensuel > AML_THRESHOLD_MONTHLY) {
      alerts.push(`monthly>${AML_THRESHOLD_MONTHLY}`);
    }

    if (alerts.length === 0) return;

    const motif = alerts.join(', ');
    this.logger.warn(
      `AML threshold exceeded for user=${ctx.userId} amount=${ctx.amount} ctx=${ctx.context} alerts=[${motif}]`,
    );

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
          cumulMensuel: ctx.cumulMensuel,
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
        },
      })
      .catch(() => {});
  }
}
