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
  NotFoundException,
  UseFilters,
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
import { CreateInvestmentUseCase } from 'src/investments/applications/usecases/create-investment.usecase';
import { InitiateInvestmentUseCase } from 'src/investments/applications/usecases/initiate-investment.usecase';
import { CancelInvestmentUseCase } from 'src/investments/applications/usecases/cancel-investment.usecase';
import type { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import {
  CreateInvestmentDto,
  TopUpDto,
  UpdateInvestmentStatusDto,
} from '../dto/investment.dto';
import { TopUpInvestmentUseCase } from 'src/investments/applications/usecases/top-up-investment.usecase';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { hasPermission } from 'src/common/auth/permissions.constants';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { SkipThrottle } from '@nestjs/throttler';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';
import {
  CODE_RETRACTATION_DEJA_EFFECTUEE,
  CODE_RETRACTATION_DELAI_EXPIRE,
  CODE_RETRACTATION_INTROUVABLE,
  CODE_RETRACTATION_NON_APPLICABLE,
  CODE_RETRACTATION_NON_PROPRIETAIRE,
  CODE_RETRACTATION_STATUT_INCOMPATIBLE,
  LIBELLE_DELAI_RETRACTATION,
} from 'src/investments/domains/retractation';
import { SignatureProviderExceptionFilter } from 'src/common/yousign/signature-provider-exception.filter';

class InitiateInvestmentDto {
  @ApiProperty({ description: 'UUID du projet' })
  @IsUUID()
  projetId: string;

  @ApiProperty({ description: 'Nombre de fractions', minimum: 1 })
  @IsInt()
  @IsPositive()
  nbFractions: number;
}

@SkipThrottle()
@ApiTags('Investments')
@ApiBearerAuth()
// Une panne du prestataire de signature (abonnement expiré, delai depasse,
// panne) doit se lire comme une indisponibilite temporaire et non comme un
// defaut applicatif : le filtre traduit en 503 rejouable. Meme traitement que
// le marche secondaire, ou la souscription passe par la meme chaine YouSign.
@UseFilters(SignatureProviderExceptionFilter)
@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentController {
  constructor(
    private readonly createInvestment: CreateInvestmentUseCase,
    private readonly topUpInvestment: TopUpInvestmentUseCase,
    private readonly initiateInvestment: InitiateInvestmentUseCase,
    private readonly cancelInvestment: CancelInvestmentUseCase,
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
  create(@Body() dto: CreateInvestmentDto, @CurrentUser() user: ActiveUser) {
    return this.createInvestment.execute(user.userId, dto);
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
  listByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    if (
      currentUser.userId !== userId &&
      !hasPermission(currentUser.role, 'users:read') &&
      !hasPermission(currentUser.role, 'projects:read')
    ) {
      throw new ForbiddenException('Accès refusé.');
    }
    return this.investmentRepository.findByUserId(userId);
  }

  @ApiOperation({ summary: "Investissements d'un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des investissements du projet' })
  @Get('project/:projetId')
  @RequirePermission('projects:read')
  listByProject(@Param('projetId') projetId: string) {
    return this.investmentRepository.findByProjetId(projetId);
  }

  @ApiOperation({ summary: "Détail d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Investissement trouvé' })
  @ApiResponse({ status: 404, description: 'Investissement introuvable' })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const inv = await this.investmentRepository.findInvestmentById(id);
    if (!inv) throw new NotFoundException('Investissement introuvable.');
    this.assertCanReadInvestment(user, inv.utilisateurId);
    return inv;
  }

  @ApiOperation({ summary: "Echéancier d'un investissement" })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: 'Echéancier de remboursement' })
  @Get(':id/schedule')
  async getSchedule(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const inv = await this.investmentRepository.findInvestmentById(id);
    if (!inv) throw new NotFoundException('Investissement introuvable.');
    this.assertCanReadInvestment(user, inv.utilisateurId);
    return this.investmentRepository.findEcheancesByInvestissement(id);
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

  @ApiOperation({ summary: 'ROI global et par projet de mes investissements' })
  @ApiResponse({ status: 200, description: 'ROI calculé' })
  @Get('roi/me')
  async getMyRoi(@CurrentUser() user: ActiveUser) {
    const investments = await this.investmentRepository.findByUserId(user.userId);
    const now = new Date();

    let montantInvestiTotal = 0;
    let gainTotal = 0;

    const roiParProjet = investments.map((inv) => {
      const montant = Number(inv.montant);
      const tri = Number((inv as any).projet?.triCible ?? 0);
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
  topUp(
    @Param('id') id: string,
    @Body() dto: TopUpDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.topUpInvestment.execute(id, user.userId, dto.nbFractions);
  }

  @ApiOperation({
    summary: `Annuler un investissement pendant le délai de rétractation (${LIBELLE_DELAI_RETRACTATION}, investisseurs non avertis uniquement)`,
    description:
      'Réservé au propriétaire de la souscription. Le remboursement est ' +
      'atomique : statut, solde et écriture de grand livre sont écrits dans ' +
      'une seule transaction. Chaque refus porte un `code` stable dans le ' +
      `corps de la réponse : \`${CODE_RETRACTATION_STATUT_INCOMPATIBLE}\`, ` +
      `\`${CODE_RETRACTATION_NON_APPLICABLE}\`, ` +
      `\`${CODE_RETRACTATION_DELAI_EXPIRE}\`, ` +
      `\`${CODE_RETRACTATION_DEJA_EFFECTUEE}\`, ` +
      `\`${CODE_RETRACTATION_NON_PROPRIETAIRE}\`, ` +
      `\`${CODE_RETRACTATION_INTROUVABLE}\`.`,
  })
  @ApiParam({ name: 'id', description: "UUID de l'investissement" })
  @ApiResponse({ status: 204, description: 'Investissement annulé avec remboursement' })
  @ApiResponse({
    status: 400,
    description: `Refus métier — \`${CODE_RETRACTATION_STATUT_INCOMPATIBLE}\` (statut non annulable), \`${CODE_RETRACTATION_NON_APPLICABLE}\` (investisseur averti : aucun délai ouvert), \`${CODE_RETRACTATION_DELAI_EXPIRE}\` (délai écoulé, \`expireLe\` renvoyé), \`${CODE_RETRACTATION_DEJA_EFFECTUEE}\` (demande concurrente déjà servie)`,
  })
  @ApiResponse({
    status: 403,
    description: `\`${CODE_RETRACTATION_NON_PROPRIETAIRE}\` — la souscription appartient à un autre investisseur`,
  })
  @ApiResponse({
    status: 404,
    description: `\`${CODE_RETRACTATION_INTROUVABLE}\` — souscription inexistante`,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.INVESTISSEUR)
  @Post(':id/retract')
  async retract(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.cancelInvestment.execute(id, user.userId);
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
