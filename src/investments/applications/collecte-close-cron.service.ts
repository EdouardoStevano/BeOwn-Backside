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
import { RefundCollecteService } from './refund-collecte.service';

/**
 * Daily cron that closes EN_COLLECTE projects whose dateCloturePrevue has
 * passed. Applies the crowdfunding "all-or-nothing" rule against the MINIMUM
 * funding threshold (capitalMinimum):
 *  - raised >= minimum  → FINANCE (success, even if below capitalCible)
 *  - raised <  minimum  → ECHEC + full automatic refund of every investor
 * The borrower schedule for financed projects is created manually by an admin.
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
    private readonly refundService: RefundCollecteService,
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
    let failed = 0;

    for (const project of projects) {
      try {
        const raised = await this.computeRaisedAmount(project.id);
        const target = Number(project.capitalCible ?? 0);
        // Seuil de succès = objectif MINIMUM de collecte (fallback sur la cible
        // si aucun minimum n'a été défini). C'est le « tout ou rien » PSFP.
        const minimum = Number(project.capitalMinimum ?? 0) || target;
        const reached = minimum > 0 && raised >= minimum;

        if (reached) {
          await this.projectRepo.update(
            { id: project.id },
            { statut: ProjectStatus.FINANCE },
          );
          await this.notifications
            .pushToAdmins({
              type: NotificationType.AUTRE,
              titre: 'Collecte financée — créer l\'échéancier',
              message: `« ${project.titre} » a atteint son objectif minimum (${raised} / min ${minimum}, cible ${target} XOF). Créez l'échéancier emprunteur depuis la fiche projet.`,
              roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
              metadata: { projectId: project.id, raised, minimum, target },
            })
            .catch(() => {});
          financed++;
          this.logger.log(
            `Project ${project.id} (${project.titre}) auto-FINANCE: raised ${raised} / min ${minimum}`,
          );
        } else {
          // Objectif minimum non atteint → échec + remboursement intégral
          const result = await this.refundService.refundProjectCollecte(
            project.id,
            {
              targetStatus: ProjectStatus.ECHEC,
              reason: `Objectif minimum de collecte non atteint à la date de clôture (${raised} / min ${minimum} XOF).`,
              triggeredByUserId: null,
            },
          );
          await this.notifications
            .pushToAdmins({
              type: NotificationType.AUTRE,
              titre: 'Collecte échouée — investisseurs remboursés',
              message: `« ${project.titre} » : objectif minimum non atteint (${raised} / min ${minimum} XOF). ${result.refundedCount} investisseur(s) remboursé(s) pour ${result.refundedAmount} XOF. Projet passé en ÉCHEC.`,
              roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
              metadata: {
                projectId: project.id,
                raised,
                minimum,
                target,
                refundedCount: result.refundedCount,
                refundedAmount: result.refundedAmount,
              },
            })
            .catch(() => {});
          failed++;
          this.logger.log(
            `Project ${project.id} (${project.titre}) auto-ECHEC + refund: raised ${raised} / min ${minimum}, refunded ${result.refundedAmount}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Failed processing project ${project.id}: ${err?.message ?? err}`,
          err?.stack,
        );
      }
    }

    this.logger.log(
      `CRON close-collecte: scanned ${projects.length} expired projects → ${financed} auto-financed, ${failed} failed+refunded`,
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
