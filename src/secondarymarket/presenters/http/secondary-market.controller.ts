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
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InitiateBuyUseCase } from 'src/secondarymarket/applications/usecases/initiate-buy.usecase';
import { ExprimerInteretUseCase } from 'src/secondarymarket/applications/usecases/exprimer-interet.usecase';
import { RepondreInteretUseCase } from 'src/secondarymarket/applications/usecases/repondre-interet.usecase';
import {
  MENTION_NON_SYSTEME_DE_NEGOCIATION,
  METHODE_PRIX_REFERENCE,
  PRIX_REFERENCE_CONTRAIGNANT,
} from 'src/secondarymarket/domains/tableau-affichage';
import { CancelInitiationUseCase } from 'src/secondarymarket/applications/usecases/cancel-initiation.usecase';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

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
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    private readonly initiateBuyUseCase: InitiateBuyUseCase,
    private readonly exprimerInteretUseCase: ExprimerInteretUseCase,
    private readonly repondreInteretUseCase: RepondreInteretUseCase,
    private readonly cancelInitiationUseCase: CancelInitiationUseCase,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    private readonly metrics: MetricsPort,
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
    // Phase 10 — Pessimistic lock sur l'investissement vendeur pour empêcher
    // les race conditions : si deux requêtes concurrentes tentent de créer
    // des ordres sur le même investissement, SELECT FOR UPDATE garantit
    // la sérialisation des lectures de fractions disponibles. Sans lock,
    // les deux validations pouvaient passer et créer un overselling.
    const saved = await this.dataSource.transaction(async (em) => {
      const investment = await em
        .createQueryBuilder(InvestmentEntity, 'inv')
        .setLock('pessimistic_write')
        .where('inv.id = :id', { id: dto.investissementId })
        .getOne();
      if (!investment) throw new NotFoundException('Investissement introuvable');
      if (investment.utilisateurId !== user.userId) {
        throw new ForbiddenException("Cet investissement ne vous appartient pas");
      }

      // Compter les fractions déjà en carnet — la lecture est sérialisée par
      // le lock acquis ci-dessus sur l'investment row.
      const activeOrders = await em.find(OrdreMarcheEntity, {
        where: {
          investissementId: dto.investissementId,
          statut: OrdreMarcheStatus.EN_CARNET,
        },
      });
      const alreadyListed = activeOrders.reduce(
        (sum, o) => sum + Number(o.nbFractions),
        0,
      );
      const available = Number(investment.nbTitres ?? 0) - alreadyListed;

      if (dto.nbFractions > available) {
        throw new BadRequestException(
          `Seulement ${available} fraction(s) disponible(s) pour la vente (${alreadyListed} déjà en carnet)`,
        );
      }

      const montant = dto.nbFractions * dto.prixUnitaire;
      const ordre = em.create(OrdreMarcheEntity, {
        investissementId: dto.investissementId,
        vendeurId: user.userId,
        sens: OrdreMarcheSens.VENTE,
        nbFractions: dto.nbFractions,
        prixUnitaire: dto.prixUnitaire,
        montant,
        statut: OrdreMarcheStatus.EN_CARNET,
        valideJusquAu: dto.valideJusquAu ? new Date(dto.valideJusquAu) : null,
      });
      return em.save(OrdreMarcheEntity, ordre);
    });

    const investment = await this.investRepo.findOne({
      where: { id: dto.investissementId },
    });
    const [project, vendeur] = await Promise.all([
      investment
        ? this.projectRepo.findOne({ where: { id: investment.projetId } })
        : null,
      this.userRepo.findOne({ where: { userId: user.userId } }),
    ]);
    if (project && vendeur) {
      this.notificationEvents.secondaryOrderCreated(saved, project, vendeur);
    }

    this.metrics.incrementCounter(METRIC.SECONDARY_ORDERS_TOTAL, { action: 'created' });
    this.metrics.observeHistogram(METRIC.SECONDARY_ORDER_AMOUNT_EUR, Number(saved.montant), {
      action: 'created',
    });
    return saved;
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
    const totalCost = qtyToBuy * Number(ordre.prixUnitaire);

    let result: {
      success: true;
      investissementId: string;
      fractionsAchetees: number;
      restantDansOrdre: number;
      fusionnee: boolean;
    };
    try {
      result = await this.dataSource.transaction(async (em) => {
      // ── Verrou + re-validation de l'ordre (anti survente concurrente) ────────
      // On recharge l'ordre SOUS VERROU dans la transaction : deux achats
      // concurrents (total/partiel) sur le même ordre sont ainsi sérialisés,
      // impossible de survendre au-delà des fractions restantes.
      const lockedOrdre = await em.findOne(OrdreMarcheEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedOrdre || lockedOrdre.statut !== OrdreMarcheStatus.EN_CARNET) {
        throw new BadRequestException('Ordre non disponible');
      }
      if (qtyToBuy > lockedOrdre.nbFractions) {
        throw new BadRequestException(
          `Quantité invalide : doit être entre 1 et ${lockedOrdre.nbFractions}`,
        );
      }

      // ── Règlement financier ATOMIQUE (correctif C-1) ─────────────────────────
      // Avant tout transfert de fractions : débit du wallet acheteur (garde de
      // solde conditionnelle) + crédit du wallet vendeur, dans la même
      // transaction. Sans ce règlement, `execute` transférait des titres
      // GRATUITEMENT (acheteur non débité, vendeur non payé).
      const buyerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: user.userId, type: WalletType.INVESTISSEUR },
        lock: { mode: 'pessimistic_write' },
      });
      if (!buyerWallet) {
        throw new BadRequestException(
          "Wallet introuvable. Alimentez votre compte avant d'acheter.",
        );
      }
      if (Number(buyerWallet.solde) < totalCost) {
        throw new BadRequestException('Solde insuffisant pour cet achat.');
      }
      // Débit conditionnel (anti double-débit / solde négatif).
      const debit = await em
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde - :cost' })
        .setParameter('cost', totalCost)
        .where('id = :id AND solde >= :cost', { id: buyerWallet.id, cost: totalCost })
        .execute();
      if (!debit.affected) {
        throw new BadRequestException('Solde insuffisant pour cet achat.');
      }

      // Crédit du vendeur (wallet créé au besoin).
      let sellerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: vendeurId, type: WalletType.INVESTISSEUR },
      });
      if (!sellerWallet) {
        sellerWallet = await em.save(
          em.create(WalletEntity, {
            type: WalletType.INVESTISSEUR,
            proprietaireUserId: vendeurId,
            fournisseurRef: `INV-${vendeurId}-auto`,
            devise: buyerWallet.devise,
            solde: 0,
          }),
        );
      }
      await em
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde + :cost' })
        .setParameter('cost', totalCost)
        .where('id = :id', { id: sellerWallet.id })
        .execute();

      // Traces ledger acheteur (débit) + vendeur (crédit).
      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletSource: buyerWallet.id,
        type: TransactionType.SOUSCRIPTION,
        montant: totalCost,
        devise: buyerWallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        projetId: investOriginal.projetId,
        metadata: { kind: 'achat_marche_secondaire', ordreId: id, vendeurId, nbFractions: qtyToBuy },
      }));
      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletDestination: sellerWallet.id,
        type: TransactionType.INTERNE,
        montant: totalCost,
        devise: sellerWallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        projetId: investOriginal.projetId,
        metadata: { kind: 'vente_marche_secondaire', ordreId: id, acheteurId: user.userId, nbFractions: qtyToBuy },
      }));

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

      // 3. Update order status (sur l'ordre VERROUILLÉ).
      if (qtyToBuy === lockedOrdre.nbFractions) {
        lockedOrdre.acheteurId = user.userId;
        lockedOrdre.statut = OrdreMarcheStatus.EXECUTE;
      } else {
        lockedOrdre.nbFractions = lockedOrdre.nbFractions - qtyToBuy;
        lockedOrdre.montant = lockedOrdre.nbFractions * Number(lockedOrdre.prixUnitaire);
      }
      await em.save(OrdreMarcheEntity, lockedOrdre);

      return {
        success: true as const,
        investissementId: buyerInvestId,
        fractionsAchetees: qtyToBuy,
        restantDansOrdre:
          lockedOrdre.statut === OrdreMarcheStatus.EXECUTE ? 0 : lockedOrdre.nbFractions,
        fusionnee: !!buyerExisting,
      };
      });
    } catch (err) {
      this.metrics.incrementCounter(METRIC.SECONDARY_EXECUTION_FAILED_TOTAL, {
        reason: this.classifyExecutionFailure(err),
      });
      throw err;
    }

    this.metrics.incrementCounter(METRIC.SECONDARY_ORDERS_TOTAL, { action: 'executed' });
    this.metrics.observeHistogram(METRIC.SECONDARY_ORDER_AMOUNT_EUR, totalCost, {
      action: 'executed',
    });

    const [project, buyerUser, sellerUser] = await Promise.all([
      this.projectRepo.findOne({ where: { id: investOriginal.projetId } }),
      this.userRepo.findOne({ where: { userId: user.userId } }),
      this.userRepo.findOne({ where: { userId: vendeurId } }),
    ]);
    if (project && buyerUser && sellerUser) {
      await this.notificationEvents.secondaryTradeExecuted(
        ordre, project, buyerUser, sellerUser, qtyToBuy,
      );
    }

    return result;
  }

  /**
   * Classe une exception d'exécution d'ordre en raison BORNÉE (jamais le
   * message brut — cardinalité Prometheus, cf. metric-names.ts) pour
   * `secondary_execution_failed_total{reason}`.
   */
  private classifyExecutionFailure(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Ordre non disponible')) return 'order_unavailable';
    if (message.startsWith('Quantité invalide')) return 'invalid_quantity';
    if (message.startsWith('Wallet introuvable')) return 'buyer_wallet_missing';
    if (message.startsWith('Solde insuffisant')) return 'insufficient_balance';
    return 'other';
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
    const saved = await this.ordreRepo.save(ordre);
    this.metrics.incrementCounter(METRIC.SECONDARY_ORDERS_TOTAL, { action: 'cancelled' });
    return saved;
  }

  @ApiOperation({
    summary: "Mentions réglementaires du tableau d'affichage (art. 25)",
  })
  @Public()
  @Get('mentions')
  mentions() {
    return {
      systemeDeNegociation: false,
      mention: MENTION_NON_SYSTEME_DE_NEGOCIATION,
      prixReferenceContraignant: PRIX_REFERENCE_CONTRAIGNANT,
      methodePrixReference: METHODE_PRIX_REFERENCE,
      texteApplicable: 'Règlement (UE) 2020/1503, article 25',
    };
  }

  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({
    summary:
      "Exprimer un intérêt pour une annonce. N'apparie rien et ne forme aucun contrat : le vendeur doit accepter (art. 25).",
  })
  @ApiParam({ name: 'id', description: "UUID de l'annonce" })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:id/interet')
  async exprimerInteret(
    @Param('id') id: string,
    @Body() dto: ExecuteOrderDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.exprimerInteretUseCase.execute(id, user.userId, dto.nbFractions ?? 1);
  }

  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({
    summary:
      "Accepter la marque d'intérêt reçue sur son annonce. Seule cette acceptation forme le contrat et déclenche la signature.",
  })
  @ApiParam({ name: 'id', description: "UUID de l'annonce" })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:id/interet/acceptation')
  async accepterInteret(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.repondreInteretUseCase.accepter(id, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Refuser la marque d'intérêt : l'annonce est remise en circulation.",
  })
  @ApiParam({ name: 'id', description: "UUID de l'annonce" })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:id/interet/refus')
  async refuserInteret(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.repondreInteretUseCase.refuser(id, user.userId);
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
