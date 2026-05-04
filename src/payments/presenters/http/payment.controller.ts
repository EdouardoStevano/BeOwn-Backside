import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { StripePaymentService } from '../../infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from '../../infrastructure/stripe-identity.service';
import { SumsubService } from '../../infrastructure/sumsub.service';
import {
  ConfirmDepotDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
  StartKycVerificationDto,
} from '../dto/payment.dto';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { Public } from 'src/common/auth/public.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { UpdateKycStatusUseCase } from 'src/profiles/applications/usecases/update-kyc-status.usecase';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

@ApiTags('Payments & KYC')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly stripeService: StripePaymentService,
    private readonly identityService: StripeIdentityServiceImpl,
    private readonly sumsubService: SumsubService,
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  // ─── Dépôt ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Initier un dépôt (Stripe PaymentIntent)' })
  @ApiResponse({
    status: 201,
    description: 'clientSecret retourné pour confirmation frontend',
  })
  @Post('depot/intent')
  async createDepotIntent(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.stripeService.createPaymentIntent({
      amount: dto.amount,
      currency: dto.currency,
      userId: user.userId,
      metadata: {
        operationType: dto.operationType ?? 'depot',
        ...(dto.projetId ? { projetId: dto.projetId } : {}),
      },
    });
  }

  @ApiOperation({ summary: 'Confirmer un dépôt et créditer le wallet' })
  @ApiResponse({ status: 200, description: 'Wallet crédité' })
  @HttpCode(HttpStatus.OK)
  @Post('depot/confirm')
  async confirmDepot(
    @Body() dto: ConfirmDepotDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const intent = await this.stripeService.retrievePaymentIntent(
      dto.paymentIntentId,
    );

    if (intent.status !== 'succeeded') {
      return { success: false, status: intent.status };
    }

    let wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: user.userId, type: WalletType.INVESTISSEUR },
    });

    if (!wallet) {
      wallet = this.walletRepo.create({
        type: WalletType.INVESTISSEUR,
        proprietaireUserId: user.userId,
        fournisseurRef: `INV-${user.userId}-auto`,
        devise: 'XOF',
        solde: 0,
      });
      wallet = await this.walletRepo.save(wallet);
    }

    const idempotencyKey = `depot:${dto.paymentIntentId}`;
    const existing = await this.txRepo.findOne({ where: { idempotencyKey } });
    if (existing) return { success: true, alreadyProcessed: true };

    await this.walletRepo
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => `solde + ${Number(intent.clientSecret) || 0}` })
      .where('id = :id', { id: wallet.id })
      .execute();

    await this.txRepo.save(
      this.txRepo.create({
        walletId: wallet.id,
        type: TransactionType.DEPOT,
        montant: 0,
        devise: 'XOF',
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: dto.paymentIntentId,
        idempotencyKey,
      }),
    );

    return { success: true, walletId: wallet.id };
  }

  @ApiOperation({ summary: 'Initier un retrait vers compte bancaire' })
  @ApiResponse({
    status: 202,
    description:
      'Demande de retrait enregistrée (traitement manuel ou via Stripe Payouts)',
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('retrait')
  async createRetrait(
    @Body() dto: CreateRetraitDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const wallet = await this.walletRepo.findOne({
      where: { id: dto.walletId, proprietaireUserId: user.userId },
    });
    if (!wallet) return { success: false, message: 'Wallet introuvable' };
    if (Number(wallet.solde) < dto.amount) {
      return { success: false, message: 'Solde insuffisant' };
    }

    const idempotencyKey = `retrait:${user.userId}:${Date.now()}`;
    const tx = await this.txRepo.save(
      this.txRepo.create({
        walletId: wallet.id,
        type: TransactionType.RETRAIT,
        montant: dto.amount,
        devise: dto.currency,
        statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: dto.ibanDestination,
        idempotencyKey,
        metadata: { ibanDestination: dto.ibanDestination },
      }),
    );

    await this.walletRepo
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => `solde - ${dto.amount}` })
      .where('id = :id', { id: wallet.id })
      .execute();

    return { success: true, transactionId: tx.id, status: tx.statut };
  }

  // ─── KYC Sumsub ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Obtenir un access token Sumsub pour le SDK Web' })
  @ApiResponse({ status: 200, description: 'Token Sumsub retourné' })
  @Get('kyc/sumsub/token')
  async getSumsubToken(@CurrentUser() user: ActiveUser) {
    return this.sumsubService.generateAccessToken(String(user.userId));
  }

  @ApiOperation({ summary: 'Webhook Sumsub (signature HMAC requise)' })
  @ApiHeader({
    name: 'x-payload-digest',
    description: 'Signature HMAC Sumsub',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Événement reçu et traité' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/sumsub')
  async handleSumsubWebhook(
    @Headers('x-payload-digest') digest: string,
    @Req() req: Request,
  ) {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (
      digest &&
      rawBody &&
      !this.sumsubService.verifyWebhookSignature(rawBody, digest)
    ) {
      throw new BadRequestException('Invalid Sumsub webhook signature');
    }

    const event = req.body as any;
    this.logger.log(
      `Sumsub webhook received: type=${event?.type}, externalUserId=${event?.externalUserId}`,
    );

    if (event.type === 'applicantReviewed') {
      const userId = parseInt(event.externalUserId, 10);
      if (!isNaN(userId)) {
        const reviewAnswer = event.reviewResult?.reviewAnswer;
        if (reviewAnswer === 'GREEN') {
          await this.updateKycStatus.execute(userId, KycStatus.VALIDE);
        } else if (reviewAnswer === 'RED') {
          const motif =
            event.reviewResult?.moderationComment ?? 'KYC refusé par Sumsub';
          await this.updateKycStatus.execute(userId, KycStatus.REFUSE, motif);
        }
      }
    } else if (event.type === 'applicantPending') {
      const userId = parseInt(event.externalUserId, 10);
      if (!isNaN(userId)) {
        await this.updateKycStatus.execute(userId, KycStatus.EN_REVUE);
      }
    }

    return { received: true, type: event?.type };
  }

  // ─── KYC Stripe Identity ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Démarrer une session KYC Stripe Identity' })
  @ApiResponse({ status: 201, description: 'URL de vérification retournée' })
  @Post('kyc/start')
  async startKyc(@Body() dto: StartKycVerificationDto) {
    return this.identityService.createVerificationSession(
      dto.userId,
      dto.email,
    );
  }

  @ApiOperation({ summary: "Consulter le statut d'une session KYC" })
  @ApiParam({
    name: 'sessionId',
    description: 'ID de la session Stripe Identity (vs_xxx)',
  })
  @ApiResponse({ status: 200, description: 'Statut de la session KYC' })
  @Get('kyc/session/:sessionId')
  async getKycSession(@Param('sessionId') sessionId: string) {
    return this.identityService.retrieveVerificationSession(sessionId);
  }

  @ApiOperation({ summary: 'Annuler une session KYC' })
  @ApiParam({
    name: 'sessionId',
    description: 'ID de la session Stripe Identity (vs_xxx)',
  })
  @ApiResponse({ status: 204, description: 'Session annulée' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('kyc/session/:sessionId/cancel')
  async cancelKycSession(@Param('sessionId') sessionId: string) {
    return this.identityService.cancelVerificationSession(sessionId);
  }

  // ─── Webhook Stripe ────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Webhook Stripe (signature HMAC requise)',
    description:
      'Endpoint appelé par Stripe. La signature `stripe-signature` dans le header est vérifiée via `STRIPE_WEBHOOK_SECRET`.',
  })
  @ApiHeader({
    name: 'stripe-signature',
    description: 'Signature HMAC Stripe',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Événement reçu et traité' })
  @Public()
  @Post('webhook/stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    const payload = Buffer.from(JSON.stringify(req.body));
    const event = this.stripeService.constructWebhookEvent(payload, signature);
    const evt = event as any;
    return { received: true, type: evt.type, eventId: evt.id };
  }
}
