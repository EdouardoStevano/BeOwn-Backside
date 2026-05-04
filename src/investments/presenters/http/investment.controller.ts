import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateInvestmentUseCase } from 'src/investments/applications/usecases/create-investment.usecase';
import type { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import {
  CreateInvestmentDto,
  UpdateInvestmentStatusDto,
} from '../dto/investment.dto';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';

@ApiTags('Investments')
@ApiBearerAuth()
@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentController {
  constructor(
    private readonly createInvestment: CreateInvestmentUseCase,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
  ) {}

  @ApiOperation({ summary: 'Créer un investissement (souscription)' })
  @ApiResponse({
    status: 201,
    description: 'Investissement créé avec échéancier',
  })
  @Post()
  create(@Body() dto: CreateInvestmentDto, @CurrentUser() user: ActiveUser) {
    return this.createInvestment.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Mes investissements' })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des investissements' })
  @Get('user/:userId')
  listByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.investmentRepository.findByUserId(userId);
  }

  @ApiOperation({ summary: "Investissements d'un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des investissements du projet' })
  @Get('project/:projetId')
  listByProject(@Param('projetId') projetId: string) {
    return this.investmentRepository.findByProjetId(projetId);
  }

  @ApiOperation({ summary: "Détail d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Investissement trouvé' })
  @ApiResponse({ status: 404, description: 'Investissement introuvable' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const inv = await this.investmentRepository.findInvestmentById(id);
    if (!inv) throw new NotFoundException('Investissement introuvable.');
    return inv;
  }

  @ApiOperation({ summary: "Echéancier d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Echéancier de remboursement' })
  @Get(':id/schedule')
  getSchedule(@Param('id') id: string) {
    return this.investmentRepository.findEcheancesByInvestissement(id);
  }

  @ApiOperation({
    summary: "Mettre à jour le statut d'un investissement (admin)",
  })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 404, description: 'Investissement introuvable' })
  @HttpCode(HttpStatus.OK)
  @Patch(':id/status')
  patchStatus(@Param('id') id: string, @Body() dto: UpdateInvestmentStatusDto) {
    return this.investmentRepository.updateInvestmentStatus(id, dto.statut);
  }

  @ApiOperation({ summary: 'Vue portfolio de mes investissements' })
  @ApiResponse({ status: 200, description: 'Résumé du portfolio' })
  @Get('portfolio/me')
  async getMyPortfolio(@CurrentUser() user: ActiveUser) {
    const investments = await this.investmentRepository.findByUserId(
      user.userId,
    );
    const montantTotal = investments.reduce(
      (sum, inv) => sum + Number(inv.montant),
      0,
    );
    return {
      userId: user.userId,
      nbInvestissements: investments.length,
      montantTotal,
      investments,
    };
  }
}
