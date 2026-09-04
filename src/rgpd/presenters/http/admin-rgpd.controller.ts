import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import {
  hasPermission,
  rolesWithPermission,
} from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import {
  RapportPurgeRgpd,
  RgpdPurgeService,
} from 'src/rgpd/applications/rgpd-purge.service';

/**
 * Rôles habilités, résolus depuis la matrice de permissions — jamais une liste
 * en dur. La purge RGPD exige la CONJONCTION de deux périmètres existants :
 * `data:export` (périmètre données personnelles) ET `audit:read` (périmètre
 * contrôle/accountability). Résultat effectif : dpo et super_admin — marketing
 * (data:export sans audit:read) et rcci (audit:read sans data:export) sont
 * exclus, sans ajouter de permission à la matrice miroir de l'Admin.
 */
export const RGPD_PURGE_ROLES: string[] = rolesWithPermission(
  'data:export',
).filter((role) => hasPermission(role, 'audit:read'));

/**
 * Déclenchement à la demande de la purge RGPD.
 *
 * Le cron quotidien (3h45) reste la vraie ligne de défense ; cette route sert
 * le DPO : constater immédiatement l'application du barème après une demande
 * d'effacement, ou produire un rapport de volumes à la demande (art. 5.2
 * RGPD). Idempotente : rejouée immédiatement, elle traite 0 ligne.
 *
 * L'appel est une mutation authentifiée : l'interceptor d'audit global
 * journalise l'acteur, la route et l'IP (audit_log) sans rien d'autre à faire
 * ici.
 */
@ApiTags('Admin — RGPD')
@ApiBearerAuth()
@Controller('admin/rgpd')
@UseGuards(JwtAuthGuard)
@RequirePermission('data:export')
export class AdminRgpdController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly purge: RgpdPurgeService,
  ) {}

  /**
   * Défense en profondeur : le rôle est relu EN BASE, pas seulement dans le
   * JWT (même motif que les autres contrôleurs admin), et confronté à la
   * conjonction de permissions ci-dessus — le guard `data:export` seul
   * laisserait passer marketing.
   */
  private async assertHabilite(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !RGPD_PURGE_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({
    summary: 'Lancer la purge RGPD (barème de conservation)',
    description:
      'Applique le barème de conservation par finalité (comptes jamais ' +
      'activés, prospects inactifs, comptes supprimés à anonymiser, dossiers ' +
      'KYC échus post-clôture, notifications, journaux d’audit), par lots ' +
      'bornés, en excluant tout compte visé par une réclamation ouverte. ' +
      'Idempotente : un second appel immédiat traite 0 ligne.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Rapport de purge : volumes traités et suspendus pour litige, par ' +
      'finalité (accountability art. 5.2 RGPD).',
  })
  // Palier resserré : la purge balaie plusieurs tables — rejouée en boucle,
  // elle consommerait la base au détriment des parcours investisseurs. Les
  // trois paliers nommés sont redéfinis ensemble (même motif que la
  // réconciliation : n'en resserrer qu'un serait sans effet).
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
    auth: { ttl: 60_000, limit: 5 },
  })
  @HttpCode(HttpStatus.OK)
  @Post('purge/run')
  async run(@CurrentUser() admin: ActiveUser): Promise<RapportPurgeRgpd> {
    await this.assertHabilite(admin.userId);
    return this.purge.purger();
  }
}
