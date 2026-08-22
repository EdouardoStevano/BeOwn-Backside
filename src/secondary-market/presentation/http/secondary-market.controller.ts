import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
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
import { Repository } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { CreateOrdreMarcheDto, ExecuteOrderDto } from '../dto/ordre-marche.dto';
import { OrdreMarcheStatus } from 'src/secondary-market/domain/enums/ordre-marche.enum';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { KycValidatedGuard } from 'src/compliance/presentation/guards/kyc-validated.guard';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { PasserOrdreDeVenteUseCase } from 'src/secondary-market/application/usecases/passer-ordre-de-vente.usecase';
import { ExecuterOrdreUseCase } from 'src/secondary-market/application/usecases/executer-ordre.usecase';
import { AnnulerOrdreUseCase } from 'src/secondary-market/application/usecases/annuler-ordre.usecase';
import { InitiateBuyUseCase } from 'src/secondary-market/application/usecases/initiate-buy.usecase';
import { CancelInitiationUseCase } from 'src/secondary-market/application/usecases/cancel-initiation.usecase';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';

/**
 * Adaptateur d'entrée HTTP du contexte — et rien de plus.
 *
 * Il portait 478 lignes : la propriété des fractions, l'anti-survente du
 * carnet, les bornes de quantité, le règlement financier, le transfert de
 * titres et les notifications, dans deux transactions écrites à même le
 * contrôleur. Toutes ces décisions sont revenues au domaine et à ses use
 * cases (§14) ; ce qui reste ici est ce qu'un contrôleur doit faire : router,
 * porter le RBAC, et servir les lectures.
 *
 * Les lectures du carnet restent des requêtes directes : ce sont des read
 * models (§11), avec leurs jointures pour le front, pas des agrégats à
 * reconstruire.
 */
@SkipThrottle()
@ApiTags('Marché Secondaire')
@ApiBearerAuth()
@Controller('secondary-market')
export class SecondaryMarketController {
  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    private readonly passerOrdreDeVente: PasserOrdreDeVenteUseCase,
    private readonly executerOrdre: ExecuterOrdreUseCase,
    private readonly annulerOrdre: AnnulerOrdreUseCase,
    private readonly initiateBuyUseCase: InitiateBuyUseCase,
    private readonly cancelInitiationUseCase: CancelInitiationUseCase,
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
  @ApiOperation({
    summary: 'Mes annonces de vente (ordres du vendeur connecté)',
  })
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
    return this.passerOrdreDeVente.execute(
      {
        investissementId: dto.investissementId,
        sens: dto.sens,
        nbFractions: dto.nbFractions,
        prixUnitaire: dto.prixUnitaire,
        valideJusquAu: dto.valideJusquAu,
      },
      user.userId,
    );
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
    return this.executerOrdre.execute(id, user.userId, dto.nbFractions);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Annuler un ordre (vendeur uniquement)' })
  @ApiParam({ name: 'id', description: "UUID de l'ordre" })
  @HttpCode(HttpStatus.OK)
  @Delete('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.annulerOrdre.execute(id, user.userId);
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
    return this.initiateBuyUseCase.execute(
      id,
      user.userId,
      dto.nbFractions ?? 1,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Annuler une initiation d'achat (avant signature)" })
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
    summary: "Statut d'une signature (polling fallback pour le client web)",
  })
  @ApiParam({ name: 'signatureId', description: 'UUID de la signature' })
  @Get('signatures/:signatureId/status')
  async signatureStatus(
    @Param('signatureId') signatureId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const signature = await this.signatureRepo.findOne({
      where: { id: signatureId },
      select: [
        'id',
        'statut',
        'userId',
        'signedAt',
        'expiresAt',
        'investmentId',
        'ordreId',
      ],
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
