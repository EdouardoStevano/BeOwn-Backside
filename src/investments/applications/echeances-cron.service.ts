import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { EcheanceEntity } from '../infrastructure/persistences/entities/echeance.entity';
import { EcheanceStatus } from '../domains/enums/investment-status.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

@Injectable()
export class EcheancesCronService {
  private readonly logger = new Logger(EcheancesCronService.name);

  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    private readonly notificationEvents: NotificationEventService,
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
    }

    this.logger.log(`CRON échéances: J-7=${j7.length}, J-1=${j1.length}, overdue=${overdue.length}`);
  }
}
