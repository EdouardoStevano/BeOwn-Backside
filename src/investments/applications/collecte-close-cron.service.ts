import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

/**
 * Daily cron that closes EN_COLLECTE projects whose dateCloturePrevue has
 * passed. If the project reached its funding target it transitions to FINANCE
 * (the borrower schedule is then created manually by an admin); otherwise
 * admins are notified to decide between extending the close date or marking
 * ECHEC.
 */
@Injectable()
export class CollecteCloseCronService {
  private readonly logger = new Logger(CollecteCloseCronService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async closeExpiredCollectes(): Promise<void> {
    const now = new Date();
    const projects = await this.projectRepo.find({
      where: {
        statut: ProjectStatus.EN_COLLECTE,
        dateCloturePrevue: LessThanOrEqual(now),
      },
    });

    if (projects.length === 0) {
      this.logger.debug('CRON close-collecte: nothing to close');
      return;
    }

    let financed = 0;
    let flaggedToAdmins = 0;

    for (const project of projects) {
      try {
        const raised = await this.computeRaisedAmount(project.id);
        const target = Number(project.capitalCible ?? 0);
        const reached = target > 0 && raised >= target;

        if (reached) {
          await this.projectRepo.update(
            { id: project.id },
            { statut: ProjectStatus.FINANCE },
          );
          await this.notifications
            .pushToAdmins({
              type: NotificationType.AUTRE,
              titre: 'Collecte financée — créer l\'échéancier',
              message: `« ${project.titre} » est financé (${raised} / ${target} XOF). Créez l'échéancier emprunteur depuis la fiche projet.`,
              roles: [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
              metadata: { projectId: project.id, raised, target },
            })
            .catch(() => {});
          financed++;
          this.logger.log(
            `Project ${project.id} (${project.titre}) auto-FINANCE: raised ${raised} / ${target}`,
          );
        } else {
          await this.notifications
            .pushToAdmins({
              type: NotificationType.AUTRE,
              titre: 'Collecte expirée non financée',
              message: `« ${project.titre} » : date de clôture dépassée, seulement ${raised} / ${target} XOF collectés. Décidez entre prolonger ou marquer en échec.`,
              roles: [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
              metadata: {
                projectId: project.id,
                raised,
                target,
                ratio: target > 0 ? raised / target : 0,
              },
            })
            .catch(() => {});
          flaggedToAdmins++;
        }
      } catch (err: any) {
        this.logger.error(
          `Failed processing project ${project.id}: ${err?.message ?? err}`,
          err?.stack,
        );
      }
    }

    this.logger.log(
      `CRON close-collecte: scanned ${projects.length} expired projects → ${financed} auto-financed, ${flaggedToAdmins} flagged to admins`,
    );
  }

  private async computeRaisedAmount(projectId: string): Promise<number> {
    const result = await this.investRepo
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.montant), 0)', 'total')
      .where('i.projetId = :projectId', { projectId })
      .andWhere('i.statut NOT IN (:...excluded)', {
        excluded: [
          InvestmentStatus.RETRACTE,
          InvestmentStatus.ANNULE,
          InvestmentStatus.INITIE,
        ],
      })
      .getRawOne<{ total: string }>();
    return Number(result?.total ?? 0);
  }
}
