import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { formatEur } from 'src/shared/money/format-eur';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { EcheanceStatus } from 'src/servicing/domain/enums/echeance.enum';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { PayEcheanceUseCase } from 'src/servicing/application/usecases/pay-echeance.usecase';
import { ProjectScheduleGeneratorService } from 'src/servicing/application/services/project-schedule-generator.service';
import { TriggerEcheancePaymentUseCase } from '../../application/usecases/trigger-echeance-payment.usecase';
import { GetAggregatedScheduleUseCase } from '../../application/usecases/get-aggregated-schedule.usecase';
import { PatchAggregatedEcheanceUseCase } from '../../application/usecases/patch-aggregated-echeance.usecase';
import { VerifierEcheanceProjetUseCase } from '../../application/usecases/verifier-echeance-projet.usecase';
import { SupprimerNumeroEcheanceUseCase } from '../../application/usecases/supprimer-numero-echeance.usecase';
import { CorrigerEcheanceUseCase } from '../../application/usecases/corriger-echeance.usecase';

const ADMIN_ROLES = rolesWithPermission('echeancier:read');
const PAY_ROLES: string[] = rolesWithPermission('echeancier:pay');

const round2 = (n: number) => Math.round(n * 100) / 100;

class UpdateEcheanceDto {
  @IsOptional() @IsDateString() datePrevue?: string;
  @IsOptional() @IsNumber() @Min(0) montantCapital?: number;
  @IsOptional() @IsNumber() @Min(0) montantInterets?: number;
  @IsOptional() @IsEnum(EcheanceStatus) statut?: EcheanceStatus;
}

class UpdateAggregatedEcheanceDto {
  @IsOptional() @IsDateString() datePrevue?: string;
  @IsOptional() @IsNumber() @Min(0) montantCapital?: number;
  @IsOptional() @IsNumber() @Min(0) montantInterets?: number;
  @IsOptional() @IsNumber() @Min(0) montantTotal?: number;
}

class InitializeScheduleDto {
  @IsDateString() dateDebut: string;
}

@ApiTags('Admin — Échéances')
@ApiBearerAuth()
@Controller('admin/projects/:projectId/echeances')
@UseGuards(JwtAuthGuard)
@RequirePermission('echeancier:read')
export class AdminEcheancesController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly payEcheance: PayEcheanceUseCase,
    private readonly scheduleGenerator: ProjectScheduleGeneratorService,
    private readonly triggerEcheancePayment: TriggerEcheancePaymentUseCase,
    private readonly aggregatedSchedule: GetAggregatedScheduleUseCase,
    private readonly patchAggregatedEcheance: PatchAggregatedEcheanceUseCase,
    private readonly verifierEcheance: VerifierEcheanceProjetUseCase,
    private readonly supprimerNumero: SupprimerNumeroEcheanceUseCase,
    private readonly corrigerEcheance: CorrigerEcheanceUseCase,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  private async assertPay(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !PAY_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @ApiOperation({
    summary:
      "Déclencher manuellement le paiement d'une échéance pour tous les investisseurs",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro de l'échéance (1-based)" })
  @ApiResponse({
    status: 200,
    description: 'Récap : nb investisseurs payés + montant total',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':numero/trigger-payment')
  async triggerPayment(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
    @Body() body?: { motif?: string },
  ): Promise<{ paidCount: number; totalAmount: number; skipped: number }> {
    await this.assertPay(admin);
    return this.triggerEcheancePayment.execute(projectId, numero, admin);
  }

  @ApiOperation({
    summary: 'Marquer une échéance comme payée (crédite le wallet)',
  })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':id/pay')
  async markPaid(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertPay(user);
    return this.payEcheance.execute(id, user.userId, user.role);
  }

  @ApiOperation({
    summary:
      "Vérifier une échéance (numero) : la marque prête à l'auto-paiement",
    description:
      'Passe les EcheanceEntity A_VENIR du projet ayant ce numéro à EN_ATTENTE_PAIEMENT. Le CRON quotidien paiera automatiquement ces échéances à leur date.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':numero/verify')
  async verify(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ verified: number }> {
    await this.assertPay(admin);
    return this.verifierEcheance.verifier(projectId, numero, admin.userId);
  }

  @ApiOperation({ summary: "Annuler la vérification d'une échéance (numero)" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('echeancier:pay')
  @Post(':numero/unverify')
  async unverify(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ reverted: number }> {
    await this.assertPay(admin);
    return this.verifierEcheance.annuler(projectId, numero);
  }

  @ApiOperation({
    summary: 'Échéancier agrégé du projet (vue admin, une ligne par numéro)',
    description:
      "Retourne l'échéancier emprunteur en agrégeant les EcheanceEntity de tous les investissements par numéro : somme des capitaux/intérêts/totaux, date partagée, statut le plus avancé.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @Get()
  async getAggregatedSchedule(
    @Param('projectId') projectId: string,
    @CurrentUser() admin: ActiveUser,
  ): Promise<
    Array<{
      numero: number;
      datePrevue: string;
      montantCapital: number;
      montantInterets: number;
      montantTotal: number;
      capitalRestantAvant: number;
      capitalRestantApres: number;
      statut: EcheanceStatus;
      nbInvestisseurs: number;
      nbPayes: number;
    }>
  > {
    await this.assertAdmin(admin);
    return this.aggregatedSchedule.execute(projectId);
  }

  @ApiOperation({
    summary: 'Modifier une échéance agrégée (date et/ou montants totaux)',
    description:
      'Met à jour les EcheanceEntity du projet ayant ce numéro (A_VENIR uniquement). Si un montant total est fourni (capital, intérêts ou total), il est réparti au prorata des fractions détenues entre les investisseurs.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @Patch(':numero')
  async patchAggregated(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: UpdateAggregatedEcheanceDto,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ updated: number }> {
    await this.assertAdmin(admin);
    return this.patchAggregatedEcheance.execute(projectId, numero, dto);
  }

  @ApiOperation({
    summary: "Supprimer toutes les échéances d'un numéro pour ce projet",
    description:
      'Supprime les EcheanceEntity du projet ayant ce numéro (uniquement si toutes A_VENIR). Renumérote les suivantes pour combler le trou.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'numero', description: "Numéro d'échéance (1-based)" })
  @HttpCode(HttpStatus.OK)
  @Delete(':numero')
  async deleteAggregated(
    @Param('projectId') projectId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ deleted: number; renumbered: number }> {
    await this.assertAdmin(admin);
    return this.supprimerNumero.execute(projectId, numero);
  }

  @ApiOperation({
    summary:
      "Créer l'échéancier emprunteur (admin) à partir d'une date de début",
    description:
      'Crée les EcheanceEntity pour tous les investissements actifs du projet : N lignes mensuelles (= dureeMois) ancrées sur dateDebut, montants pré-calculés au prorata des fractions détenues. In-fine : intérêts mensuels constants, capital à la dernière échéance. Refusé si un échéancier existe déjà.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @HttpCode(HttpStatus.OK)
  @Post('initialize')
  async initialize(
    @Param('projectId') projectId: string,
    @Body() dto: InitializeScheduleDto,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{ investmentsProcessed: number; echeancesGenerated: number }> {
    await this.assertAdmin(admin);
    try {
      return await this.scheduleGenerator.initializeForProject(
        projectId,
        new Date(dto.dateDebut),
      );
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Création échouée');
    }
  }

  @ApiOperation({
    summary: 'Régénérer les échéances A_VENIR (utilitaire admin)',
    description:
      "Supprime les échéances A_VENIR et les recalcule à partir d'une nouvelle date. Préserve les échéances payées/retard.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({
    status: 200,
    description: 'Résumé : nb investissements + nb générées + nb supprimées',
  })
  @HttpCode(HttpStatus.OK)
  @Post('recompute')
  async recompute(
    @Param('projectId') projectId: string,
    @Body() dto: InitializeScheduleDto,
    @CurrentUser() admin: ActiveUser,
  ): Promise<{
    investmentsProcessed: number;
    echeancesGenerated: number;
    echeancesDeleted: number;
  }> {
    await this.assertAdmin(admin);
    return this.scheduleGenerator.regenerateForProject(
      projectId,
      new Date(dto.dateDebut),
    );
  }
}

@ApiTags('Admin — Échéances (item)')
@ApiBearerAuth()
@Controller('admin/echeances')
@UseGuards(JwtAuthGuard)
@RequirePermission('echeancier:read')
export class AdminEcheancesItemController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly corrigerEcheance: CorrigerEcheanceUseCase,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  private async assertPay(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !PAY_ROLES.includes(u.role as UserRole)) {
      throw new ForbiddenException("Accès réservé à l'équipe finance/admin");
    }
  }

  @ApiOperation({ summary: 'Mettre à jour une échéance' })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @RequirePermission('echeancier:pay')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEcheanceDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<EcheanceEntity> {
    await this.assertPay(user);
    return this.corrigerEcheance.corriger(id, dto);
  }

  @ApiOperation({ summary: 'Supprimer une échéance (uniquement si non payée)' })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<void> {
    await this.assertAdmin(user);
    await this.corrigerEcheance.supprimer(id);
  }
}
