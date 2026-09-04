import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { CalculateDistributionPeriodeUseCase } from '../../applications/usecases/calculate-distribution-periode.usecase';
import { ValidatePeriodeDistributionUseCase } from '../../applications/usecases/validate-periode-distribution.usecase';
import { ExecuteDistributionUseCase } from '../../applications/usecases/execute-distribution.usecase';
import { DistributionsCronService } from '../../applications/distributions-cron.service';
import {
  PERIODE_DISTRIBUTION_REPOSITORY,
  type PeriodeDistributionRepository,
} from '../../applications/ports/repositories/periode-distribution.repository';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from '../../applications/ports/repositories/distribution-part.repository';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { CalculateDistributionDto } from '../dto/calculate-distribution.dto';

const ROLES_DISTRIBUTION: string[] = rolesWithPermission('distributions:execute');

/**
 * Palier de débit d'une route qui verse RÉELLEMENT de l'argent. Dix par
 * minute : très au-delà de tout usage humain, très en deçà de ce qu'exigerait
 * l'exploitation automatisée d'un jeton administrateur volé. Les trois
 * throttlers nommés sont redéfinis, la configuration globale les appliquant
 * tous à chaque route. Aligné sur `AdminVersementPorteurController`.
 */
const DEBIT_OPERATION_ARGENT = {
  short: { ttl: 60_000, limit: 10 },
  medium: { ttl: 60_000, limit: 10 },
  auth: { ttl: 60_000, limit: 10 },
} as const;

@ApiTags('Admin — Distributions')
@ApiBearerAuth()
@Controller('admin/distributions')
@UseGuards(JwtAuthGuard)
@RequirePermission('distributions:execute')
export class AdminDistributionsController {
  constructor(
    private readonly calculateUseCase: CalculateDistributionPeriodeUseCase,
    private readonly validateUseCase: ValidatePeriodeDistributionUseCase,
    private readonly executeUseCase: ExecuteDistributionUseCase,
    private readonly cronService: DistributionsCronService,
    @Inject(PERIODE_DISTRIBUTION_REPOSITORY)
    private readonly periodeRepo: PeriodeDistributionRepository,
    @Inject(DISTRIBUTION_PART_REPOSITORY)
    private readonly partRepo: DistributionPartRepository,
    // Lecture seule : relecture du rôle en base avant tout versement.
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  @Post('calculate')
  @ApiOperation({
    summary: 'Calculer la distribution d\'un projet pour une période',
  })
  calculate(@Body() dto: CalculateDistributionDto) {
    return this.calculateUseCase.execute(dto.projetId, dto.periode);
  }

  @Post('calculate-all/:periode')
  @ApiOperation({
    summary:
      'Calculer toutes les distributions equity-FINANCE pour une période (équivalent du cron mensuel, déclenché manuellement)',
  })
  calculateAll(@Param('periode') periode: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) {
      throw new BadRequestException('Format période invalide (YYYY-MM).');
    }
    return this.cronService.run(periode);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Périodes calculées en attente de validation' })
  listPending() {
    return this.periodeRepo.findByStatut(StatutPeriodeDistribution.CALCULEE);
  }

  @Get('validated')
  @ApiOperation({ summary: 'Périodes validées prêtes à exécuter' })
  listValidated() {
    return this.periodeRepo.findByStatut(StatutPeriodeDistribution.VALIDEE);
  }

  @Get(':id/parts')
  @ApiOperation({ summary: 'Détail des parts d\'une période' })
  listParts(@Param('id') id: string) {
    return this.partRepo.findByPeriode(id);
  }

  @Post(':id/validate')
  @ApiOperation({
    summary: 'Valider une période calculée (passe en VALIDEE)',
  })
  validate(@Param('id') id: string) {
    return this.validateUseCase.validate(id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Annuler une période calculée ou validée (avant exécution)',
  })
  cancel(@Param('id') id: string) {
    return this.validateUseCase.cancel(id);
  }

  /**
   * Seule route de ce contrôleur qui DÉPLACE DE L'ARGENT : elle crédite les
   * portefeuilles des bénéficiaires et débite les séquestres fiscaux. Deux
   * durcissements à la mesure de cet effet :
   *
   *  - le rôle est RELU EN BASE (patron `AdminVersementPorteurController`) et
   *    c'est LUI qui est transmis au use case. Le rôle du jeton y était passé
   *    tel quel : un jeton émis avant le retrait d'un accès conservait le
   *    pouvoir d'exécuter un versement, et l'audit du use case enregistrait
   *    même ce rôle périmé comme s'il faisait foi ;
   *  - un palier de débit explicite : le contrôleur n'en déclarait aucun et
   *    tombait sur les limites globales, larges et jamais choisies pour une
   *    route de ce genre.
   */
  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Exécuter le versement des parts (crédit wallets, débit séquestres IR/CSG)',
  })
  @ApiResponse({ status: 403, description: 'Rôle non habilité' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_OPERATION_ARGENT)
  async execute(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const role = await this.assertPeutExecuter(user.userId);
    return this.executeUseCase.execute(id, user.userId, role);
  }

  /** Rôle relu en base, et rendu pour que l'audit du use case dise vrai. */
  private async assertPeutExecuter(userId: number): Promise<string> {
    const acteur = await this.userRepo.findOne({
      where: { userId },
      select: ['userId', 'role'],
    });
    if (!acteur || !ROLES_DISTRIBUTION.includes(acteur.role)) {
      throw new ForbiddenException(
        'Exécution réservée aux rôles habilités aux distributions.',
      );
    }
    return acteur.role;
  }

  @Get('historique/projet/:projetId')
  @ApiOperation({ summary: 'Historique des distributions d\'un projet' })
  historique(@Param('projetId') projetId: string) {
    return this.periodeRepo.findHistoriqueByProjet(projetId);
  }
}
