import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/iam/presentation/decorators/roles.decorator';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { GetInvestisseurDistributionHistoryUseCase } from '../../applications/usecases/get-investisseur-distribution-history.usecase';

@ApiTags('Investisseur — Distributions')
@ApiBearerAuth()
@Controller('investisseur/distributions')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.INVESTISSEUR)
export class InvestisseurDistributionsController {
  constructor(
    private readonly historyUseCase: GetInvestisseurDistributionHistoryUseCase,
  ) {}

  @Get('history')
  @ApiOperation({
    summary:
      'Historique des distributions reçues + KPIs (capital, ROI, gains)',
  })
  async getHistory(@CurrentUser() user: ActiveUser) {
    return this.historyUseCase.execute(user.userId);
  }
}
