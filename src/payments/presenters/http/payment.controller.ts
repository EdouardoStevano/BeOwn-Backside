import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { StripePaymentService } from '../../infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from '../../infrastructure/stripe-identity.service';
import {
  ConfirmDepotDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
  StartKycVerificationDto,
} from '../dto/payment.dto';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from 'src/wallets/infrastructures/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructures/persistences/entities/transaction.entity';
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

@ApiTags('Payments & KYC')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(
    private readonly stripeService: StripePaymentService,
    private readonly identityService: StripeIdentityServiceImpl,
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
  @Get('kyc/session/:sessionId')
  async getKycSession(@Param('sessionId') sessionId: string) {
    return this.identityService.retrieveVerificationSession(sessionId);
  }

  @ApiOperation({ summary: 'Annuler une session KYC' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('kyc/session/:sessionId/cancel')
  async cancelKycSession(@Param('sessionId') sessionId: string) {
    return this.identityService.cancelVerificationSession(sessionId);
  }

  // ─── Webhook Stripe ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Webhook Stripe (signature HMAC requise)' })
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
