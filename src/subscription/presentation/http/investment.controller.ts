import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsPositive, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateInvestmentUseCase } from 'src/subscription/application/usecases/create-investment.usecase';
import { InitiateInvestmentUseCase } from 'src/subscription/application/usecases/initiate-investment.usecase';
import { RetractInvestmentUseCase } from 'src/subscription/application/usecases/retract-investment.usecase';
import type { InvestmentRepository } from 'src/subscription/domain/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from 'src/subscription/domain/repositories/investment.repository';
import type { InvestmentSnapshot } from 'src/subscription/domain/aggregates/investment';
import { InvestissementIntrouvableError } from 'src/subscription/domain/errors/subscription.errors';
import {
  CreateInvestmentDto,
  TopUpDto,
  UpdateInvestmentStatusDto,
} from './dto/investment.dto';
import { TopUpInvestmentUseCase } from 'src/subscription/application/usecases/top-up-investment.usecase';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { KycValidatedGuard } from 'src/compliance/presentation/guards/kyc-validated.guard';
import { Roles } from 'src/iam/presentation/decorators/roles.decorator';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { hasPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { SkipThrottle } from '@nestjs/throttler';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { EcheanceStatus } from 'src/subscription/domain/enums/investment-status.enum';

class InitiateInvestmentDto {
  @ApiProperty({ description: 'UUID du projet' })
  @IsUUID()
  projetId: string;

  @ApiProperty({ description: 'Nombre de fractions', minimum: 1 })
  @IsInt()
  @IsPositive()
  nbFractions: number;
}

/**
 * Routes de la souscription. Le contrôleur ne parle qu'aux use cases et rend
 * des snapshots — mêmes clés JSON que l'ancien modèle anémique qu'il
 * sérialisait tel quel. Les erreurs métier remontent telles quelles :
 * `SubscriptionErrorFilter` les traduit (§21).
 *
 * Le RBAC (`Roles`, `RequirePermission`, `KycValidatedGuard`) reste ici : c'est
 * de la composition d'accès, pas une règle du domaine (§3.3).
 */
@SkipThrottle()
@ApiTags('Investments')
@ApiBearerAuth()
@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentController {
  constructor(
    private readonly createInvestment: CreateInvestmentUseCase,
    private readonly topUpInvestment: TopUpInvestmentUseCase,
    private readonly initiateInvestment: InitiateInvestmentUseCase,
    private readonly retractInvestment: RetractInvestmentUseCase,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  private canReadInvestment(user: ActiveUser, ownerUserId: number): boolean {
    return (
      user.userId === ownerUserId ||
      hasPermission(user.role, 'projects:read') ||
      hasPermission(user.role, 'funds:disburse') ||
      hasPermission(user.role, 'users:read')
    );
  }

  private assertCanReadInvestment(
    user: ActiveUser,
    ownerUserId: number,
  ): void {
    if (this.canReadInvestment(user, ownerUserId)) return;
    throw new ForbiddenException('Acces refuse.');
  }

  @ApiOperation({ summary: 'Créer un investissement (souscription)' })
  @ApiResponse({
    status: 201,
    description: 'Investissement créé avec échéancier',
  })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
  @Roles(UserRole.INVESTISSEUR)
  @Post()
  async create(
    @Body() dto: CreateInvestmentDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<InvestmentSnapshot> {
    const investment = await this.createInvestment.execute(user.userId, dto);
    return investment.snapshot();
  }

  @ApiOperation({ summary: 'Initier un investissement avec signature YouSign (sans débit immédiat)' })
  @ApiResponse({ status: 201, description: '{ signingUrl, signatureId }' })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
  @Roles(UserRole.INVESTISSEUR)
  @Post('initiate')
  initiateWithYouSign(@Body() dto: InitiateInvestmentDto, @CurrentUser() user: ActiveUser) {
    return this.initiateInvestment.execute(user.userId, dto.projetId, dto.nbFractions);
  }

  @ApiOperation({ summary: 'Mes investissements' })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des investissements' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @Get('user/:userId')
  async listByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() currentUser: ActiveUser,
  ): Promise<InvestmentSnapshot[]> {
    if (
      currentUser.userId !== userId &&
      !hasPermission(currentUser.role, 'users:read') &&
      !hasPermission(currentUser.role, 'projects:read')
    ) {
      throw new ForbiddenException('Accès refusé.');
    }
    const investments = await this.investmentRepository.findByUserId(userId);
    return investments.map((i) => i.snapshot());
  }

  @ApiOperation({ summary: "Investissements d'un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des investissements du projet' })
  @Get('project/:projetId')
  @RequirePermission('projects:read')
  async listByProject(
    @Param('projetId') projetId: string,
  ): Promise<InvestmentSnapshot[]> {
    const investments =
      await this.investmentRepository.findByProjetId(projetId);
    return investments.map((i) => i.snapshot());
  }

  @ApiOperation({ summary: "Détail d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Investissement trouvé' })
  @ApiResponse({ status: 404, description: 'Investissement introuvable' })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<InvestmentSnapshot> {
    const inv = await this.investmentRepository.findById(id);
    if (!inv) throw new InvestissementIntrouvableError(id);
    this.assertCanReadInvestment(user, inv.utilisateurId);
    return inv.snapshot();
  }

  @ApiOperation({ summary: "Echéancier d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Echéancier de remboursement' })
  @Get(':id/schedule')
  async getSchedule(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const inv = await this.investmentRepository.findById(id);
    if (!inv) throw new InvestissementIntrouvableError(id);
    this.assertCanReadInvestment(user, inv.utilisateurId);
    const echeances =
      await this.investmentRepository.findEcheancesByInvestissement(id);
    return echeances.map((e) => e.snapshot());
  }

  @ApiOperation({
    summary: "Mettre à jour le statut d'un investissement (admin)",
  })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 404, description: 'Investissement introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('funds:disburse')
  @Patch(':id/status')
  async patchStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInvestmentStatusDto,
  ): Promise<InvestmentSnapshot> {
    const investment = await this.investmentRepository.findById(id);
    if (!investment) throw new InvestissementIntrouvableError(id);

    // Reprise en main manuelle du back-office : le statut est posé hors de
    // tout cycle de vie, mais passe par l'agrégat (§6) — le repository
    // n'expose plus d'écriture de colonne.
    investment.forcerStatutParAdministration(dto.statut);

    const saved = await this.investmentRepository.save(investment);
    return saved.snapshot();
  }

  @ApiOperation({ summary: 'Vue portfolio de mes investissements' })
  @ApiResponse({ status: 200, description: 'Résumé du portfolio' })
  @Get('portfolio/me')
  async getMyPortfolio(@CurrentUser() user: ActiveUser) {
    const investments = await this.investmentRepository.findByUserId(
      user.userId,
    );
    const montantTotal = investments.reduce((sum, inv) => sum + inv.montant, 0);
    return {
      userId: user.userId,
      nbInvestissements: investments.length,
      montantTotal,
      investments: investments.map((i) => i.snapshot()),
    };
  }

  @ApiOperation({ summary: 'ROI global et par projet de mes investissements' })
  @ApiResponse({ status: 200, description: 'ROI calculé' })
  @Get('roi/me')
  async getMyRoi(@CurrentUser() user: ActiveUser) {
    const investments = await this.investmentRepository.findByUserId(user.userId);
    const now = new Date();

    let montantInvestiTotal = 0;
    let gainTotal = 0;

    const roiParProjet = investments.map((inv) => {
      const montant = inv.montant;
      const tri = Number(inv.projet?.triCible ?? 0);
      const createdAt = new Date(inv.createdAt ?? now);
      const anneesEcoulees =
        (now.getTime() - createdAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const gain = Math.round(montant * (tri / 100) * anneesEcoulees * 100) / 100;
      const montantActuel = montant + gain;
      const roiPct = montant > 0 ? Math.round((gain / montant) * 10000) / 100 : 0;

      montantInvestiTotal += montant;
      gainTotal += gain;

      return {
        investissementId: inv.id,
        projetId: inv.projetId,
        montantInvesti: montant,
        gain,
        montantActuel,
        roi: roiPct,
        triCible: tri,
        statut: inv.statut,
      };
    });

    const roiGlobal =
      montantInvestiTotal > 0
        ? Math.round((gainTotal / montantInvestiTotal) * 10000) / 100
        : 0;

    return {
      montantInvestiTotal,
      gainTotal: Math.round(gainTotal * 100) / 100,
      montantActuelTotal: Math.round((montantInvestiTotal + gainTotal) * 100) / 100,
      roiGlobal,
      roiParProjet,
    };
  }

  @ApiOperation({ summary: "Rajouter des fractions à un investissement existant (débit wallet)" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Investissement mis à jour' })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
  @Roles(UserRole.INVESTISSEUR)
  @HttpCode(HttpStatus.OK)
  @Patch(':id/top-up')
  async topUp(
    @Param('id') id: string,
    @Body() dto: TopUpDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<InvestmentSnapshot> {
    const investment = await this.topUpInvestment.execute(
      id,
      user.userId,
      dto.nbFractions,
    );
    return investment.snapshot();
  }

  @ApiOperation({ summary: 'Annuler un investissement pendant le délai de rétractation (4j, non-averti uniquement)' })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 204, description: 'Investissement annulé avec remboursement' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.INVESTISSEUR)
  @Post(':id/retract')
  async retract(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<void> {
    await this.retractInvestment.execute(id, user.userId);
  }

  @ApiOperation({ summary: 'Résumé fiscal annuel de mes échéances (PFU 30%)' })
  @ApiResponse({ status: 200, description: 'Données fiscales par année' })
  @Get('fiscal/me')
  async getMyFiscalSummary(
    @CurrentUser() user: ActiveUser,
    @Query('year') yearParam?: string,
  ) {
    const investments = await this.investmentRepository.findByUserId(user.userId);
    const invIds = investments.map((i) => i.id);

    if (invIds.length === 0) {
      // Données de démonstration quand aucun investissement réel
      const demoSummary = {
        2024: { year: 2024, totalInteretsBruts: 3240.00, totalIR: 414.72, totalCSG: 556.88, totalNet: 2268.40, nbEcheances: 12 },
        2025: { year: 2025, totalInteretsBruts: 4875.50, totalIR: 624.06, totalCSG: 838.59, totalNet: 3412.85, nbEcheances: 18 },
      };
      return { availableYears: [2025, 2024], selectedYear: 2025, summary: demoSummary };
    }

    const echeances = await this.echeanceRepo
      .createQueryBuilder('e')
      .where('e.investissementId IN (:...ids)', { ids: invIds })
      .andWhere('e.statut = :statut', { statut: EcheanceStatus.PAYE })
      .andWhere('e.payeLe IS NOT NULL')
      .orderBy('e.payeLe', 'ASC')
      .getMany();

    const byYear = new Map<number, { totalInteretsBruts: number; totalIR: number; totalCSG: number; nbEcheances: number }>();
    for (const e of echeances) {
      const yr = new Date(e.payeLe!).getFullYear();
      const existing = byYear.get(yr) ?? { totalInteretsBruts: 0, totalIR: 0, totalCSG: 0, nbEcheances: 0 };
      existing.totalInteretsBruts += Number(e.montantInterets ?? 0);
      existing.totalIR += Number(e.prelevementIR ?? 0);
      existing.totalCSG += Number(e.prelevementCSG ?? 0);
      existing.nbEcheances += 1;
      byYear.set(yr, existing);
    }

    const availableYears = Array.from(byYear.keys()).sort((a, b) => b - a);
    const summary: Record<number, object> = {};
    for (const [yr, data] of byYear.entries()) {
      summary[yr] = {
        year: yr,
        totalInteretsBruts: Math.round(data.totalInteretsBruts * 100) / 100,
        totalIR: Math.round(data.totalIR * 100) / 100,
        totalCSG: Math.round(data.totalCSG * 100) / 100,
        totalNet: Math.round((data.totalInteretsBruts - data.totalIR - data.totalCSG) * 100) / 100,
        nbEcheances: data.nbEcheances,
      };
    }

    const selectedYear = yearParam ? parseInt(yearParam, 10) : (availableYears[0] ?? new Date().getFullYear());
    return { availableYears, selectedYear, summary };
  }
}
