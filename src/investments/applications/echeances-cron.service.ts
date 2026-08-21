import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { EcheanceEntity } from '../infrastructure/persistences/entities/echeance.entity';
import { EcheanceStatus } from '../domains/enums/investment-status.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { PayEcheanceUseCase } from './usecases/pay-echeance.usecase';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

@Injectable()
export class EcheancesCronService {
  private readonly logger = new Logger(EcheancesCronService.name);

  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    private readonly notificationEvents: NotificationEventService,
    private readonly payEcheance: PayEcheanceUseCase,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsPort,
  ) {}

  @Cron('0 9 * * *')
  async processEcheances(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const addDays = (d: Date, n: number): Date => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    };

    // J-7 reminders
    const j7 = await this.echeanceRepo.find({
      where: {
        datePrevue: Between(addDays(today, 7), addDays(today, 8)),
        statut: EcheanceStatus.A_VENIR,
        rappelJ7Envoye: false,
      },
      relations: ['investissement', 'investissement.projet'],
    });
    for (const e of j7) {
      await this.notificationEvents.echeanceUpcoming(e, (e as any).investissement.projet);
      await this.echeanceRepo.update(e.id, { rappelJ7Envoye: true });
    }

    // J-1 reminders
    const j1 = await this.echeanceRepo.find({
      where: {
        datePrevue: Between(addDays(today, 1), addDays(today, 2)),
        statut: EcheanceStatus.A_VENIR,
        rappelJ1Envoye: false,
      },
      relations: ['investissement', 'investissement.projet'],
    });
    for (const e of j1) {
      await this.notificationEvents.echeanceUpcoming(e, (e as any).investissement.projet);
      await this.echeanceRepo.update(e.id, { rappelJ1Envoye: true });
    }

    // Overdue échéances
    const overdue = await this.echeanceRepo.find({
      where: { datePrevue: LessThan(today), statut: EcheanceStatus.A_VENIR },
      relations: ['investissement', 'investissement.projet'],
    });
    for (const e of overdue) {
      await this.echeanceRepo.update(e.id, { statut: EcheanceStatus.RETARD });
      await this.notificationEvents.echeanceOverdueAdmin(e, (e as any).investissement.projet);
      this.metrics.incrementCounter(METRIC.ECHEANCE_OVERDUE_TRANSITIONS_TOTAL);
    }

    this.logger.log(`CRON échéances: J-7=${j7.length}, J-1=${j1.length}, overdue=${overdue.length}`);
  }

  /**
   * Auto-paiement quotidien des échéances vérifiées (EN_ATTENTE_PAIEMENT) dont
   * la date est atteinte. Les échéances dues encore A_VENIR (non vérifiées) sont
   * signalées à la finance sans être payées. Idempotent (idempotencyKey pay).
   */
  @Cron('0 9 * * *')
  async autoPayVerifiedDue(): Promise<void> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const dueVerified = await this.echeanceRepo.find({
      where: { datePrevue: LessThanOrEqual(today), statut: EcheanceStatus.EN_ATTENTE_PAIEMENT },
    });
    let paid = 0;
    let failed = 0;
    for (const e of dueVerified) {
      try {
        await this.payEcheance.execute(e.id, 0, UserRole.SUPER_ADMIN, 'cron');
        paid++;
      } catch {
        failed++;
        this.metrics.incrementCounter(METRIC.ECHEANCE_AUTOPAY_FAILED_TOTAL);
      }
    }

    const dueUnverified = await this.echeanceRepo.count({
      where: { datePrevue: LessThanOrEqual(today), statut: EcheanceStatus.A_VENIR },
    });
    this.metrics.setGauge(METRIC.ECHEANCES_DUE_UNVERIFIED, dueUnverified);
    if (dueUnverified > 0) {
      this.notifications
        .pushToAdmins({
          type: NotificationType.ECHEANCE,
          titre: 'Échéances dues non vérifiées',
          message: `${dueUnverified} échéance(s) sont dues aujourd'hui mais non vérifiées : à vérifier pour paiement.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
          metadata: { dueUnverified },
        })
        .catch(() => {});
    }
    this.logger.log(`CRON auto-pay: payées=${paid}, échecs=${failed}, dues non vérifiées=${dueUnverified}`);
  }
}
