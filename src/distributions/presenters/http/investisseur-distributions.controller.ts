import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { GetInvestisseurDistributionHistoryUseCase } from '../../applications/usecases/get-investisseur-distribution-history.usecase';

@ApiTags('Investisseur — Distributions')
@ApiBearerAuth()
@Controller('investisseur/distributions')
@UseGuards(JwtAuthGuard)
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
