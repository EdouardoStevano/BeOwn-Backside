import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvestorKpiService } from 'src/kpi/applications/investor-kpi.service';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UpdateRegimeFiscalDto } from './dto/update-regime-fiscal.dto';

@Controller('me')
export class InvestorKpiController {
  constructor(
    private readonly service: InvestorKpiService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  @Get('portfolio/kpis')
  async getPortfolioKpis(@Req() req: { user?: { userId?: number } }) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    return this.service.computePortfolio(userId);
  }

  @Patch('regime-fiscal')
  async updateRegimeFiscal(
    @Req() req: { user?: { userId?: number } },
    @Body() dto: UpdateRegimeFiscalDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    await this.userRepo.update(
      { userId },
      {
        regimeFiscal: dto.regimeFiscal,
        tauxBaremeMarginal: dto.tauxBaremeMarginal ?? null,
      },
    );
    return { ok: true, regimeFiscal: dto.regimeFiscal };
  }
}
