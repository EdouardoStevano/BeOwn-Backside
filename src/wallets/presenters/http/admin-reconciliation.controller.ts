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
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import {
  RapportReconciliation,
  ReconciliationService,
} from 'src/wallets/applications/reconciliation.service';

/**
 * Rôles habilités, résolus depuis la matrice de permissions — jamais une liste
 * de rôles écrite en dur : ajouter un rôle à `retraits:manage` doit suffire.
 */
const ADMIN_ROLES: string[] = rolesWithPermission('retraits:manage');

/**
 * Déclenchement à la demande de la réconciliation financière.
 *
 * Le cron quotidien reste la vraie ligne de défense ; cette route sert
 * l'investigation : rejouer le contrôle juste après une correction manuelle,
 * ou vérifier immédiatement l'état du grand livre sans attendre 5h30.
 *
 * LECTURE SEULE côté argent : la réconciliation constate, elle ne déplace ni
 * ne corrige aucun fonds. La permission exigée est néanmoins celle de la
 * finance (`retraits:manage`) parce que le rapport EXPOSE la position
 * financière complète de la plateforme — solde PSP compris.
 */
@ApiTags('Admin — Réconciliation')
@ApiBearerAuth()
@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard)
@RequirePermission('retraits:manage')
export class AdminReconciliationController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * Défense en profondeur : le rôle est relu EN BASE, pas seulement dans le
   * JWT — même motif que les autres contrôleurs admin. Un jeton encore valide
   * mais émis avant un retrait de rôle est refusé ici, après le guard.
   */
  private async assertAdmin(userId: number): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
    return user;
  }

  @ApiOperation({
    summary: 'Lancer la réconciliation financière',
    description:
      'Rapproche chaque portefeuille de son registre (Σ crédits − Σ débits) ' +
      'et compare le solde détenu chez le prestataire de paiement à la somme ' +
      'des portefeuilles investisseurs. Aucune écriture n’est créée ni ' +
      'corrigée : le rapport est un CONSTAT.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Rapport de réconciliation : nombre de portefeuilles et d’écritures ' +
      'contrôlés, écarts par portefeuille, écart cumulé, solde investisseurs, ' +
      'solde PSP (null s’il est injoignable) et verdict d’équilibre.',
  })
  // Palier de débit resserré : la réconciliation balaie l'intégralité du grand
  // livre. Rejouée en boucle, elle saturerait la base au détriment des
  // parcours investisseurs. Les TROIS paliers nommés du dépôt sont redéfinis :
  // n'en resserrer qu'un laisserait les deux autres à leur limite globale,
  // très supérieure, et le resserrement serait sans effet.
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
    auth: { ttl: 60_000, limit: 5 },
  })
  @HttpCode(HttpStatus.OK)
  @Post('run')
  async run(@CurrentUser() admin: ActiveUser): Promise<RapportReconciliation> {
    await this.assertAdmin(admin.userId);
    return this.reconciliation.reconcilier();
  }
}
