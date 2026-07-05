import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
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

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Exécuter le versement des parts (crédit wallets, débit séquestres IR/CSG)',
  })
  execute(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.executeUseCase.execute(id, user.userId);
  }

  @Get('historique/projet/:projetId')
  @ApiOperation({ summary: 'Historique des distributions d\'un projet' })
  historique(@Param('projetId') projetId: string) {
    return this.periodeRepo.findHistoriqueByProjet(projetId);
  }
}
