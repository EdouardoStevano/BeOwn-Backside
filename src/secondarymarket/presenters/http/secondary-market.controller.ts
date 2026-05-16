import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { CreateOrdreMarcheDto, ExecuteOrderDto } from '../dto/ordre-marche.dto';
import {
  OrdreMarcheStatus,
  OrdreMarcheSens,
} from 'src/secondarymarket/domains/ordre-marche';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { Public } from 'src/common/auth/public.decorator';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InitiateBuyUseCase } from 'src/secondarymarket/applications/usecases/initiate-buy.usecase';
import { CancelInitiationUseCase } from 'src/secondarymarket/applications/usecases/cancel-initiation.usecase';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';

@SkipThrottle()
@ApiTags('Marché Secondaire')
@ApiBearerAuth()
@Controller('secondary-market')
export class SecondaryMarketController {
  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly initiateBuyUseCase: InitiateBuyUseCase,
    private readonly cancelInitiationUseCase: CancelInitiationUseCase,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
  ) {}

  @Public()
  @ApiOperation({ summary: "Carnet d'ordres disponibles (public)" })
  @Get('orders')
  listOrders() {
    return this.ordresWithRelations()
      .where('ord.statut = :statut', { statut: OrdreMarcheStatus.EN_CARNET })
      .orderBy('ord.createdAt', 'DESC')
      .getMany();
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mes annonces de vente (ordres du vendeur connecté)" })
  @Get('orders/mine')
  async myOrders(@CurrentUser() user: ActiveUser) {
    return this.ordresWithRelations()
      .where('ord.vendeurId = :vendeurId', { vendeurId: user.userId })
      .orderBy('ord.createdAt', 'DESC')
      .getMany();
  }

  private ordresWithRelations() {
    return this.ordreRepo
      .createQueryBuilder('ord')
      .leftJoinAndMapOne(
        'ord.investissement',
        InvestmentEntity,
        'inv',
        'inv.id = ord."investissementId"',
      )
      .leftJoinAndMapOne(
        'inv.projet',
        ProjectEntity,
        'p',
        'p.id = inv."projetId"',
      );
  }

  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({ summary: 'Passer un ordre de vente' })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @Post('orders')
  async createOrder(
    @Body() dto: CreateOrdreMarcheDto,
    @CurrentUser() user: ActiveUser,
  ) {
    // Validate ownership
    const investment = await this.investRepo.findOne({ where: { id: dto.investissementId } });
    if (!investment) throw new NotFoundException('Investissement introuvable');
    if (investment.utilisateurId !== user.userId) {
      throw new ForbiddenException("Cet investissement ne vous appartient pas");
    }

    // Check available fractions (total - already listed in active orders)
    const activeOrders = await this.ordreRepo.find({
      where: { investissementId: dto.investissementId, statut: OrdreMarcheStatus.EN_CARNET },
    });
    const alreadyListed = activeOrders.reduce((sum, o) => sum + Number(o.nbFractions), 0);
    const available = Number(investment.nbTitres ?? 0) - alreadyListed;

    if (dto.nbFractions > available) {
      throw new BadRequestException(
        `Seulement ${available} fraction(s) disponible(s) pour la vente (${alreadyListed} déjà en carnet)`,
      );
    }

    const montant = dto.nbFractions * dto.prixUnitaire;
    const ordre = this.ordreRepo.create({
      investissementId: dto.investissementId,
      vendeurId: user.userId,
      sens: OrdreMarcheSens.VENTE,
      nbFractions: dto.nbFractions,
      prixUnitaire: dto.prixUnitaire,
      montant,
      statut: OrdreMarcheStatus.EN_CARNET,
      valideJusquAu: dto.valideJusquAu ? new Date(dto.valideJusquAu) : null,
    });
    return this.ordreRepo.save(ordre);
  }

  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({ summary: 'Exécuter un ordre (achat total ou partiel)' })
  @ApiParam({ name: 'id', description: "UUID de l'ordre" })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:id/execute')
  async executeOrder(
    @Param('id') id: string,
    @Body() dto: ExecuteOrderDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const ordre = await this.ordreRepo.findOne({
      where: { id },
      relations: ['investissement', 'investissement.projet'],
    });

    if (!ordre) throw new NotFoundException('Ordre introuvable');
    if (ordre.statut !== OrdreMarcheStatus.EN_CARNET) {
      throw new BadRequestException('Ordre non disponible');
    }
    if (ordre.vendeurId === user.userId) {
      throw new ForbiddenException('Vous ne pouvez pas acheter votre propre ordre');
    }

    const qtyToBuy = dto.nbFractions ?? ordre.nbFractions;

    if (qtyToBuy < 1 || qtyToBuy > ordre.nbFractions) {
      throw new BadRequestException(
        `Quantité invalide : doit être entre 1 et ${ordre.nbFractions}`,
      );
    }

    const investOriginal = ordre.investissement;
    if (!investOriginal) throw new NotFoundException('Investissement source introuvable');

    const vendeurId = ordre.vendeurId;

    const result = await this.dataSource.transaction(async (em) => {
      // 1. Merge with existing buyer investment in same project, or create new
      const buyerExisting = await em.findOne(InvestmentEntity, {
        where: {
          utilisateurId: user.userId,
          projetId: investOriginal.projetId,
          statut: InvestmentStatus.CONFIRME,
        },
      });

      let buyerInvestId: string;
      if (buyerExisting) {
        buyerExisting.nbTitres = (buyerExisting.nbTitres ?? 0) + qtyToBuy;
        buyerExisting.montant = Number(buyerExisting.montant) + qtyToBuy * Number(ordre.prixUnitaire);
        await em.save(InvestmentEntity, buyerExisting);
        buyerInvestId = buyerExisting.id;
      } else {
        const newInvest = em.create(InvestmentEntity, {
          projetId: investOriginal.projetId,
          utilisateurId: user.userId,
          montant: qtyToBuy * Number(ordre.prixUnitaire),
          instrument: investOriginal.instrument,
          nbTitres: qtyToBuy,
          valeurTitre: Number(ordre.prixUnitaire),
          statut: InvestmentStatus.CONFIRME,
        });
        await em.save(InvestmentEntity, newInvest);
        buyerInvestId = newInvest.id;
      }

      // 2. Reduce seller's investment fractions
      const sellerInvest = await em.findOne(InvestmentEntity, { where: { id: ordre.investissementId } });
      if (sellerInvest && sellerInvest.nbTitres != null) {
        const remaining = Number(sellerInvest.nbTitres) - qtyToBuy;
        sellerInvest.nbTitres = Math.max(0, remaining);
        sellerInvest.montant = remaining > 0
          ? Number(sellerInvest.montant) - qtyToBuy * Number(sellerInvest.valeurTitre ?? ordre.prixUnitaire)
          : 0;
        await em.save(InvestmentEntity, sellerInvest);
      }

      // 3. Update order status
      if (qtyToBuy === ordre.nbFractions) {
        ordre.acheteurId = user.userId;
        ordre.statut = OrdreMarcheStatus.EXECUTE;
      } else {
        ordre.nbFractions = ordre.nbFractions - qtyToBuy;
        ordre.montant = ordre.nbFractions * Number(ordre.prixUnitaire);
      }
      await em.save(OrdreMarcheEntity, ordre);

      return {
        success: true,
        investissementId: buyerInvestId,
        fractionsAchetees: qtyToBuy,
        restantDansOrdre: ordre.statut === OrdreMarcheStatus.EXECUTE ? 0 : ordre.nbFractions,
        fusionnee: !!buyerExisting,
      };
    });

    this.notificationService.push({
      utilisateurId: user.userId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: 'Achat de fractions confirmé',
      message: `Vous avez acheté ${qtyToBuy} fraction(s) à ${ordre.prixUnitaire} XOF/fraction.`,
      metadata: { ordreId: id, fractionsAchetees: qtyToBuy, prixUnitaire: ordre.prixUnitaire },
    }).catch(() => {});

    this.notificationService.push({
      utilisateurId: vendeurId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: 'Vente de fractions exécutée',
      message: `${qtyToBuy} fraction(s) de votre ordre ont été achetées à ${ordre.prixUnitaire} XOF/fraction.`,
      metadata: { ordreId: id, fractionsVendues: qtyToBuy, prixUnitaire: ordre.prixUnitaire },
    }).catch(() => {});

    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Annuler un ordre (vendeur uniquement)' })
  @ApiParam({ name: 'id', description: "UUID de l'ordre" })
  @HttpCode(HttpStatus.OK)
  @Delete('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const ordre = await this.ordreRepo.findOne({ where: { id } });
    if (!ordre) throw new NotFoundException('Ordre introuvable');
    if (ordre.vendeurId !== user.userId) {
      throw new ForbiddenException('Non autorisé');
    }
    if (ordre.statut !== OrdreMarcheStatus.EN_CARNET) {
      throw new BadRequestException("Cet ordre ne peut plus être annulé");
    }
    ordre.statut = OrdreMarcheStatus.ANNULE;
    return this.ordreRepo.save(ordre);
  }

  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({ summary: 'Initier un achat (génère contrat + YouSign)' })
  @ApiParam({ name: 'id', description: "UUID de l'ordre" })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:id/initiate-buy')
  async initiateBuy(
    @Param('id') id: string,
    @Body() dto: ExecuteOrderDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.initiateBuyUseCase.execute(id, user.userId, dto.nbFractions ?? 1);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Annuler une initiation d\'achat (avant signature)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('signatures/:signatureId/cancel')
  async cancelInitiation(
    @Param('signatureId') signatureId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.cancelInitiationUseCase.execute(signatureId, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Signatures liées à un investissement' })
  @ApiParam({ name: 'investmentId', description: "UUID de l'investissement" })
  @Get('signatures/investment/:investmentId')
  async signaturesForInvestment(
    @Param('investmentId') investmentId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.signatureRepo.find({
      where: { investmentId, userId: user.userId },
      order: { createdAt: 'DESC' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Statut d\'une signature (polling fallback pour le client web)',
  })
  @ApiParam({ name: 'signatureId', description: 'UUID de la signature' })
  @Get('signatures/:signatureId/status')
  async signatureStatus(
    @Param('signatureId') signatureId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const signature = await this.signatureRepo.findOne({
      where: { id: signatureId },
      select: ['id', 'statut', 'userId', 'signedAt', 'expiresAt', 'investmentId', 'ordreId'],
    });
    if (!signature) throw new NotFoundException('Signature introuvable');
    if (signature.userId !== user.userId) {
      throw new ForbiddenException('Accès refusé');
    }
    return {
      id: signature.id,
      statut: signature.statut,
      signedAt: signature.signedAt,
      expiresAt: signature.expiresAt,
      investmentId: signature.investmentId,
      ordreId: signature.ordreId,
    };
  }
}
