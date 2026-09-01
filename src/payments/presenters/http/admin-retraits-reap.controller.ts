import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { RetraitsReaperService } from '../../applications/retraits-reaper.service';

const ROLES_RETRAITS: string[] = rolesWithPermission('retraits:manage');

/**
 * Déclenchement manuel du rattrapage des retraits (cf. `RetraitsReaperService`).
 *
 * Le balayage tourne toutes les heures ; cette route existe pour ne pas avoir à
 * attendre l'ordonnanceur quand on vient de rétablir l'abonnement webhook ou de
 * constater des retraits bloqués. Elle ne fait RIEN de plus que le cron : même
 * service, mêmes gardes, même idempotence.
 *
 * Elle vit dans le module `payments` et non dans `admin` : le balayage y est
 * défini, avec l'accès au prestataire. La faire vivre côté admin obligerait ce
 * module à importer tout le module de paiement pour une seule route.
 */
@ApiTags('Admin — Retraits')
@ApiBearerAuth()
@Controller('admin/retraits')
@UseGuards(JwtAuthGuard)
@RequirePermission('retraits:manage')
export class AdminRetraitsReapController {
  private readonly logger = new Logger(AdminRetraitsReapController.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly reaper: RetraitsReaperService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Défense en profondeur : le rôle est revérifié EN BASE, pas seulement dans le jeton. */
  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ROLES_RETRAITS.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({
    summary:
      'Vérifier auprès du prestataire les retraits « en cours » et clore ceux qui sont dénoués',
  })
  @ApiResponse({
    status: 200,
    description:
      'Compte rendu du balayage : retraits vérifiés, clos, compensés, laissés en l\'état, escaladés.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('reap')
  async reap(@CurrentUser() admin: ActiveUser) {
    await this.assertAdmin(admin.userId);

    const resultat = await this.reaper.reap();
    this.logger.log(
      `Balayage des retraits déclenché manuellement par l'administrateur ${admin.userId} : ` +
        `${resultat.verifies} vérifié(s), ${resultat.clos} clos, ${resultat.compenses} compensé(s), ` +
        `${resultat.laisses} laissé(s), ${resultat.alertes} alerte(s).`,
    );

    await this.auditLog.create(
      String(admin.userId),
      admin.role ?? UserRole.SUPER_ADMIN,
      'retrait.reap',
      'transaction',
      undefined,
      undefined,
      undefined,
      { ...resultat },
    );

    return resultat;
  }
}
