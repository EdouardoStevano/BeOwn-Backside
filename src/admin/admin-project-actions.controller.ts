import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Inject,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { formatEur } from 'src/common/money/format-eur';
import {
  UserEntity,
  UserRole,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { RefundCollecteService } from 'src/investments/applications/refund-collecte.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { BroadcastService } from 'src/notifications/applications/broadcast.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

const ADMIN_ROLES: string[] = rolesWithPermission('projects:manage');

class CancelCollecteDto {
  reason?: string;
}

@ApiTags('Admin – Project actions')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
@RequirePermission('projects:manage')
export class AdminProjectActionsController {
  private readonly logger = new Logger(AdminProjectActionsController.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    private readonly notif: NotificationService,
    private readonly refundService: RefundCollecteService,
    private readonly broadcast: BroadcastService,
    private readonly metrics: MetricsPort,
  ) {}

  private async ensureAdmin(currentUser: ActiveUser): Promise<UserEntity> {
    const u = await this.userRepo.findOne({ where: { userId: currentUser.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role)) {
      throw new ForbiddenException("Accès réservé aux administrateurs.");
    }
    return u;
  }

  @ApiOperation({ summary: 'Annuler la collecte et rembourser tous les investisseurs' })
  @ApiResponse({ status: 200, description: 'Collecte annulée, investisseurs remboursés' })
  @Post('projects/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelCollecte(
    @Param('id') id: string,
    @Body() dto: CancelCollecteDto,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.ensureAdmin(currentUser);
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const refundable = [
      ProjectStatus.ANNONCE,
      ProjectStatus.PRE_INVESTISSEMENT,
      ProjectStatus.EN_COLLECTE,
    ];
    if (!refundable.includes(project.statut)) {
      throw new ForbiddenException(
        `Annulation impossible depuis le statut "${project.statut}".`,
      );
    }

    const result = await this.refundService.refundProjectCollecte(id, {
      targetStatus: ProjectStatus.ANNULE,
      reason: dto.reason ?? null,
      triggeredByUserId: currentUser.userId,
    });
    this.metrics.incrementCounter(METRIC.COLLECTE_CLOSED_TOTAL, { outcome: 'annule' });

    return {
      projectId: id,
      newStatus: ProjectStatus.ANNULE,
      refundedCount: result.refundedCount,
      refundedAmount: result.refundedAmount,
    };
  }

  @ApiOperation({
    summary:
      'Clôturer la collecte selon le seuil minimum (tout ou rien crowdfunding)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Si l\'objectif minimum est atteint → FINANCE, sinon → ÉCHEC + remboursement intégral',
  })
  @Post('projects/:id/close-collecte')
  @HttpCode(HttpStatus.OK)
  async closeCollecte(
    @Param('id') id: string,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.ensureAdmin(currentUser);
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Projet introuvable.');
    if (project.statut !== ProjectStatus.EN_COLLECTE) {
      throw new ForbiddenException(
        `Clôture possible uniquement depuis le statut "en_collecte" (actuel : "${project.statut}").`,
      );
    }

    const raisedRow = await this.investRepo
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.montant), 0)', 'total')
      .where('i.projetId = :id', { id })
      .andWhere('i.statut NOT IN (:...excluded)', {
        excluded: [
          InvestmentStatus.RETRACTE,
          InvestmentStatus.ANNULE,
          InvestmentStatus.INITIE,
        ],
      })
      .getRawOne<{ total: string }>();
    const raised = Number(raisedRow?.total ?? 0);
    const target = Number(project.capitalCible ?? 0);
    const minimum = Number(project.capitalMinimum ?? 0) || target;

    if (minimum > 0 && raised >= minimum) {
      await this.projectRepo.update({ id }, { statut: ProjectStatus.FINANCE });
      await this.notif
        .pushToAdmins({
          type: NotificationType.AUTRE,
          titre: 'Collecte financée — créer l\'échéancier',
          message: `« ${project.titre} » a atteint son objectif minimum (${formatEur(raised)} / min ${formatEur(minimum)}). Créez l'échéancier emprunteur.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
          metadata: { projectId: id, raised, minimum, target },
        })
        .catch(() => {});
      this.metrics.incrementCounter(METRIC.COLLECTE_CLOSED_TOTAL, { outcome: 'finance' });
      return {
        projectId: id,
        outcome: 'finance',
        newStatus: ProjectStatus.FINANCE,
        raised,
        minimum,
        target,
      };
    }

    const result = await this.refundService.refundProjectCollecte(id, {
      targetStatus: ProjectStatus.ECHEC,
      reason: `Objectif minimum de collecte non atteint (${formatEur(raised)} / min ${formatEur(minimum)}).`,
      triggeredByUserId: currentUser.userId,
    });
    this.metrics.incrementCounter(METRIC.COLLECTE_CLOSED_TOTAL, { outcome: 'echec' });
    return {
      projectId: id,
      outcome: 'echec',
      newStatus: ProjectStatus.ECHEC,
      raised,
      minimum,
      target,
      refundedCount: result.refundedCount,
      refundedAmount: result.refundedAmount,
    };
  }

  @ApiOperation({ summary: 'Publier un projet en mode "annonce" (vitrine)' })
  @RequirePermission('projects:publish')
  @Post('projects/:id/publish-annonce')
  @HttpCode(HttpStatus.OK)
  async publishAnnonce(
    @Param('id') id: string,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.ensureAdmin(currentUser);
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Projet introuvable.');
    if (project.statut !== ProjectStatus.BROUILLON) {
      throw new ForbiddenException(
        `Passage en annonce uniquement depuis le statut brouillon.`,
      );
    }
    await this.projectRepo.update(
      { id },
      { statut: ProjectStatus.ANNONCE, datePublication: new Date() },
    );

    // Diffusion « réservations ouvertes » en fire-and-forget : la publication
    // ne doit jamais échouer parce qu'un email n'est pas parti. Le service est
    // idempotent (horodatage anti-doublon) et n'émet jamais d'exception.
    void this.broadcast
      .announceReservationOpened(id, currentUser.userId)
      .catch((e) =>
        this.logger.error(
          `Diffusion « ouverture de réservation » échouée pour le projet ${id}`,
          e instanceof Error ? e.stack : String(e),
        ),
      );

    return { id, statut: ProjectStatus.ANNONCE };
  }

}
