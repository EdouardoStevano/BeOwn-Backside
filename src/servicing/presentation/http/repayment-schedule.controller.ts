import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  TITULAIRE_INVESTISSEMENT_PORT,
  type TitulaireInvestissementPort,
} from 'src/servicing/application/ports/titulaire-investissement.port';
import {
  REPAYMENT_SCHEDULE_REPOSITORY,
  type RepaymentScheduleRepository,
} from 'src/servicing/domain/repositories/repayment-schedule.repository';
import { InvestissementIntrouvableError } from 'src/servicing/domain/errors';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { hasPermission } from 'src/iam/domain/policies/role-permissions.policy';

/**
 * L'échéancier d'un investissement, côté investisseur.
 *
 * La route est inchangée — `GET /investments/:id/schedule` — mais elle est
 * servie par le contexte qui possède l'échéancier. Elle vivait dans
 * `InvestmentController`, qui lisait les échéances par
 * `InvestmentRepository.findEcheancesByInvestissement` : le contrôleur d'un
 * contexte rendait la collection d'un autre (§10).
 *
 * Le RBAC reste dans la présentation : c'est de la composition d'accès, pas
 * une règle du domaine (§3.3). La règle est celle d'avant, au caractère près —
 * son titulaire, ou un rôle qui a le droit de lire les investissements.
 */
@SkipThrottle()
@ApiTags('Investments')
@ApiBearerAuth()
@Controller('investments')
@UseGuards(JwtAuthGuard)
export class RepaymentScheduleController {
  constructor(
    @Inject(REPAYMENT_SCHEDULE_REPOSITORY)
    private readonly echeanciers: RepaymentScheduleRepository,
    @Inject(TITULAIRE_INVESTISSEMENT_PORT)
    private readonly investissements: TitulaireInvestissementPort,
  ) {}

  @ApiOperation({ summary: "Echéancier d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Echéancier de remboursement' })
  @ApiResponse({ status: 404, description: 'Investissement introuvable' })
  @Get(':id/schedule')
  async getSchedule(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const titulaire = await this.investissements.titulaireDe(id);
    if (titulaire === null) {
      throw new InvestissementIntrouvableError(id);
    }
    this.assertPeutLire(user, titulaire);

    const echeancier = await this.echeanciers.findByInvestissement(id);
    return echeancier.snapshot();
  }

  private assertPeutLire(user: ActiveUser, titulaireId: number): void {
    const autorise =
      user.userId === titulaireId ||
      hasPermission(user.role, 'projects:read') ||
      hasPermission(user.role, 'funds:disburse') ||
      hasPermission(user.role, 'users:read');

    if (!autorise) {
      throw new ForbiddenException('Acces refuse.');
    }
  }
}
