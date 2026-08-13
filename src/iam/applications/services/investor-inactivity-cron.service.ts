import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import {
  NotificationEntity,
  NotificationType,
} from 'src/notifications/infrastructure/persistences/entities/notification.entity';

@Injectable()
export class InvestorInactivityCronService {
  private readonly logger = new Logger(InvestorInactivityCronService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifRepo: Repository<NotificationEntity>,
    private readonly notifications: NotificationService,
  ) {}

  /** Chaque lundi 7h : alerte le chargé de relation des investisseurs inactifs > 2 mois. */
  @Cron('0 7 * * 1')
  async flagInactiveInvestors(): Promise<void> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 2);
    const dedupSince = new Date();
    dedupSince.setDate(dedupSince.getDate() - 30);

    const candidates = await this.userRepo.find({
      where: [
        {
          role: UserRole.INVESTISSEUR,
          status: UserStatus.ACTIF,
          lastLoginAt: LessThan(cutoff),
        },
        {
          role: UserRole.INVESTISSEUR,
          status: UserStatus.ACTIF,
          lastLoginAt: IsNull(),
          createdAt: LessThan(cutoff),
        },
      ],
    });

    let notified = 0;
    for (const u of candidates) {
      // Dédup : déjà notifié pour ce user dans les 30 derniers jours ?
      const recent = await this.notifRepo
        .createQueryBuilder('n')
        .where('n.type = :type', {
          type: NotificationType.INVESTISSEUR_INACTIF,
        })
        .andWhere("n.metadata ->> 'userId' = :uid", { uid: String(u.userId) })
        .andWhere('n.createdAt >= :since', { since: dedupSince })
        .getCount();
      if (recent > 0) continue;

      await this.notifications.pushToAdmins({
        type: NotificationType.INVESTISSEUR_INACTIF,
        titre: 'Investisseur inactif',
        message:
          `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim() +
          ` est inactif depuis plus de 2 mois — à recontacter.`,
        roles: [UserRole.CHARGE_RELATION_INVESTISSEUR, UserRole.SUPER_ADMIN],
        metadata: { userId: u.userId, lastLoginAt: u.lastLoginAt },
      });
      notified++;
    }
    this.logger.log(
      `CRON inactivité: ${notified} investisseur(s) signalé(s) sur ${candidates.length} candidat(s)`,
    );
  }
}
