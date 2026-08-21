import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { StripePaymentAdapter } from '../../infrastructure/external-services/stripe-payment.adapter';
import { StripeConnectAdapter } from '../../infrastructure/external-services/stripe-connect.adapter';
import type { ConnectAccountStatus } from '../../infrastructure/external-services/stripe-connect.adapter';
import { RequestRetraitUseCase } from '../../application/usecases/request-retrait.usecase';
import {
  ConfirmDepotDto,
  ConnectOnboardingDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
} from './dto/payment.dto';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { formatEur } from 'src/shared/money/format-eur';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { KycValidatedGuard } from 'src/compliance/presentation/guards/kyc-validated.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { HandleIdentityWebhookUseCase } from 'src/compliance/application/usecases/kyc/handle-identity-webhook.usecase';

/**
 * Dépôts, retraits Stripe Connect, et l'endpoint webhook Stripe.
 *
 * Les routes KYC — session Stripe Identity, images, statut de session — ont
 * quitté ce contrôleur avec leur contexte : voir `KycController` (`/kyc/*`).
 * Les anciennes URLs `/payments/kyc/*` restent servies par
 * `KycLegacyPaymentsController`, et sont dépréciées.
 */
@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly stripeService: StripePaymentAdapter,
    private readonly stripeConnect: StripeConnectAdapter,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService,
    // Les événements `identity.*` du webhook partagé sont passés au contexte
    // KYC : cet endpoint authentifie l'événement, il ne l'interprète pas.
    private readonly identityWebhook: HandleIdentityWebhookUseCase,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly requestRetrait: RequestRetraitUseCase,
  ) {}

  // ─── Dépôt ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Initier un dépôt (Stripe PaymentIntent)' })
  @ApiResponse({
    status: 201,
    description: 'clientSecret retourné pour confirmation frontend',
  })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
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
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
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

    // ── Garde anti-BOLA (H-1) ────────────────────────────────────────────────
    // Le PaymentIntent porte `metadata.userId` (posé à la création, cf.
    // stripe-payment.service.ts). On refuse tout crédit si l'appelant n'est pas
    // le propriétaire du PaymentIntent — sinon un utilisateur pourrait créditer
    // son wallet avec le dépôt d'un tiers dont il connaît l'id `pi_xxx`.
    if (intent.metadata?.userId !== String(user.userId)) {
      this.logger.warn(
        `Tentative de confirmation de dépôt non autorisée: appelant=${user.userId} ` +
          `propriétaire PaymentIntent=${intent.metadata?.userId ?? 'inconnu'} pi=${dto.paymentIntentId}`,
      );
      throw new ForbiddenException(
        "Ce paiement n'appartient pas à votre compte.",
      );
    }

    const amountMajor = Number(intent.amount) / 100;

    // Crédit atomique + idempotent (H-A) — voir creditDepositAtomic.
    const { credited, walletId } = await this.creditDepositAtomic(
      user.userId,
      dto.paymentIntentId,
      amountMajor,
    );
    if (!credited) return { success: true, alreadyProcessed: true };

    this.notificationService
      .push({
        utilisateurId: user.userId,
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Dépôt confirmé',
        message: `Votre dépôt de ${formatEur(amountMajor)} a été crédité sur votre wallet.`,
        metadata: {
          paymentIntentId: dto.paymentIntentId,
          montant: amountMajor,
        },
      })
      .catch(() => {});

    this.notificationService
      .pushToAdmins({
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Dépôt utilisateur',
        message: `User #${user.userId} a déposé ${formatEur(amountMajor)}.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          userId: user.userId,
          paymentIntentId: dto.paymentIntentId,
          montant: amountMajor,
        },
      })
      .catch(() => {});

    return { success: true, walletId };
  }

  /**
   * Crédit de dépôt ATOMIQUE et idempotent (correctif H-A). Dans une seule
   * transaction DB : on INSÈRE d'abord la ligne ledger (clé unique
   * `depot:<pi>`) — un doublon lève une violation d'unicité (23505) qui
   * court-circuite le crédit — PUIS on incrémente le wallet. L'incrément ne
   * peut donc jamais s'exécuter deux fois pour un même PaymentIntent, même sous
   * appels concurrents (confirmDepot + webhook, ou rafales de confirmDepot).
   *
   * @returns credited=true si le wallet vient d'être crédité, false si le
   *          PaymentIntent avait déjà été traité (no-op idempotent).
   */
  private async creditDepositAtomic(
    userId: number,
    paymentIntentId: string,
    amountMajor: number,
  ): Promise<{ credited: boolean; walletId: string }> {
    // Wallet garanti présent hors section critique (idempotent : 1 par user/type).
    let wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) {
      wallet = await this.walletRepo.save(
        this.walletRepo.create({
          type: WalletType.INVESTISSEUR,
          proprietaireUserId: userId,
          fournisseurRef: `INV-${userId}-auto`,
          devise: 'EUR',
          solde: 0,
        }),
      );
    }

    const idempotencyKey = `depot:${paymentIntentId}`;
    try {
      await this.dataSource.transaction(async (em) => {
        // 1. Insert ledger FIRST — la contrainte unique rejette tout doublon.
        await em.insert(TransactionEntity, {
          walletId: wallet.id,
          type: TransactionType.DEPOT,
          montant: amountMajor,
          devise: 'EUR',
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.STRIPE,
          fournisseurRef: paymentIntentId,
          idempotencyKey,
        });
        // 2. Crédit atomique — atteint uniquement au 1er traitement.
        await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :amount' })
          .setParameter('amount', amountMajor)
          .where('id = :id', { id: wallet.id })
          .execute();
      });
      return { credited: true, walletId: wallet.id };
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        // Dépôt déjà traité (violation d'unicité) → no-op idempotent.
        return { credited: false, walletId: wallet.id };
      }
      throw err;
    }
  }

  // ─── Retrait Stripe Connect Express (E3) ──────────────────────────────────

  @ApiOperation({
    summary: "Lien d'onboarding Stripe Connect Express (compte de retrait)",
    description:
      "Crée si besoin le compte Connect Express de l'investisseur et renvoie une URL d'onboarding hébergée par Stripe. À vérifier en STAGING (clés live).",
  })
  @ApiResponse({
    status: 201,
    description: '{ url } — rediriger le front vers cette URL',
  })
  @Post('connect/onboarding-link')
  async connectOnboardingLink(
    @Body() dto: ConnectOnboardingDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? '';
    const returnUrl =
      dto.returnUrl ?? `${frontend}/dashboard/wallet?connect=done`;
    const refreshUrl =
      dto.refreshUrl ?? `${frontend}/dashboard/wallet?connect=refresh`;

    const url = await this.stripeConnect.createAccountLink(
      user.userId,
      returnUrl,
      refreshUrl,
      user.email,
    );
    return { url };
  }

  @ApiOperation({
    summary: 'Statut du compte Stripe Connect de retrait',
    description:
      "Renvoie details_submitted / charges_enabled / payouts_enabled. Le retrait n'est possible que si payoutsEnabled=true.",
  })
  @ApiResponse({ status: 200, description: 'Statut du compte connecté' })
  @Get('connect/status')
  async connectStatus(@CurrentUser() user: ActiveUser) {
    return this.stripeConnect.getAccountStatus(user.userId);
  }

  @ApiOperation({ summary: 'Initier un retrait vers compte bancaire' })
  @ApiResponse({
    status: 202,
    description:
      'Retrait exécuté via Stripe Connect (Transfer/Payout) ou enregistré pour traitement manuel legacy (secours).',
  })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('retrait')
  async createRetrait(
    @Body() dto: CreateRetraitDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.requestRetrait.execute(dto, user);
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
  @SkipThrottle({ short: true, medium: true, auth: true })
  @Post('webhook/stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    const rawBody: Buffer =
      (req as any).rawBody ??
      (req.body instanceof Buffer
        ? req.body
        : Buffer.from(JSON.stringify(req.body)));

    this.logger.debug(
      `Webhook rawBody length=${rawBody?.length}, sig present=${!!signature}`,
    );

    let event: any;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.error(`Webhook signature failed: ${err.message}`);
      throw new BadRequestException(
        `Webhook signature invalide: ${err.message}`,
      );
    }

    this.logger.log(`Stripe webhook: type=${event.type}, id=${event.id}`);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const userId = parseInt(intent.metadata?.userId, 10);
      const operationType = intent.metadata?.operationType ?? 'depot';

      if (!isNaN(userId) && operationType === 'depot') {
        const amountMajor = Number(intent.amount) / 100;
        // Crédit atomique + idempotent partagé avec confirmDepot (H-A).
        const { credited } = await this.creditDepositAtomic(
          userId,
          intent.id,
          amountMajor,
        );
        if (credited) {
          this.logger.log(
            `Wallet crédité: userId=${userId}, montant=${amountMajor}`,
          );
          this.notificationService
            .push({
              utilisateurId: userId,
              type: NotificationType.DEPOT_CONFIRME,
              titre: 'Dépôt confirmé',
              message: `Votre dépôt de ${formatEur(amountMajor)} a été crédité sur votre wallet.`,
              metadata: { paymentIntentId: intent.id, montant: amountMajor },
            })
            .catch(() => {});
        }
      }
    } else if (HandleIdentityWebhookUseCase.concerne(event.type)) {
      // Vérification d'identité : cet endpoint est partagé avec le contexte
      // KYC, qui décide seul de ce qu'un `identity.*` fait au dossier. Payments
      // n'en connaît ni les statuts, ni les transitions, ni les notifications.
      await this.identityWebhook.handle(event);
    } else if (event.type === 'account.updated') {
      // Stripe Connect (E3) — maj des drapeaux du compte connecté (payoutsEnabled…)
      await this.handleAccountUpdated(event);
    } else if (event.type === 'payout.paid') {
      // Stripe Connect (E3) — payout arrivé en banque → finalise le retrait
      await this.handlePayoutPaid(event);
    } else if (event.type === 'payout.failed') {
      // Stripe Connect (E3) — payout échoué → reversal + recrédit du wallet
      await this.handlePayoutFailed(event);
    }

    return { received: true, type: event.type, eventId: event.id };
  }

  // ─── Stripe Connect — helpers webhook (E3) ─────────────────────────────────

  /**
   * `account.updated` — Stripe notifie une évolution du compte connecté.
   * On rafraîchit les drapeaux en base (dont payoutsEnabled) et on prévient
   * l'investisseur si son compte de retrait vient d'être activé.
   */
  private async handleAccountUpdated(event: any): Promise<void> {
    const account = event.data.object;
    const { found, payoutsJustEnabled } =
      await this.stripeConnect.syncAccountFromWebhook(account);
    if (!found) return;

    this.logger.log(
      `account.updated: compte=${account.id} payouts_enabled=${!!account.payouts_enabled} ` +
        `details_submitted=${!!account.details_submitted}`,
    );

    if (payoutsJustEnabled) {
      const user = await this.stripeConnect.findUserByConnectAccountId(
        account.id,
      );
      if (user) {
        this.notificationService
          .push({
            utilisateurId: user.userId,
            type: NotificationType.RETRAIT_TRAITE,
            titre: 'Compte de retrait activé',
            message:
              'Votre compte de retrait Stripe est configuré. Vous pouvez désormais retirer vos fonds.',
            metadata: { accountId: account.id },
          })
          .catch(() => {});
      }
    }
  }

  /**
   * `payout.paid` — le payout est arrivé sur le compte bancaire de
   * l'investisseur. Finalise le retrait (EN_COURS → REUSSI). Idempotent (un
   * retrait déjà REUSSI ou recrédité est un no-op). Mappé via
   * `payout.metadata.retraitTxId` (posé lors du payout explicite) ; un payout
   * automatique sans metadata est simplement journalisé.
   */
  private async handlePayoutPaid(event: any): Promise<void> {
    const payout = event.data.object;
    const retraitTxId = payout?.metadata?.retraitTxId as string | undefined;
    if (!retraitTxId) {
      this.logger.debug(
        `payout.paid sans retraitTxId (payout automatique) payout=${payout?.id} account=${event.account} — info`,
      );
      return;
    }

    const tx = await this.txRepo.findOne({ where: { id: retraitTxId } });
    if (!tx || tx.type !== TransactionType.RETRAIT) {
      this.logger.warn(`payout.paid: retrait introuvable txId=${retraitTxId}`);
      return;
    }
    const meta = tx.metadata ?? {};
    if (
      tx.statut === TransactionStatus.REUSSI ||
      tx.statut === TransactionStatus.ECHOUE ||
      meta.recredited === true
    ) {
      return; // idempotent / retrait déjà finalisé ou recrédité
    }

    tx.statut = TransactionStatus.REUSSI;
    await this.txRepo.save(tx);
    this.logger.log(
      `Retrait finalisé (payout.paid): tx=${tx.id} payout=${payout?.id}`,
    );

    const userId = meta.userId as number | undefined;
    if (userId) {
      this.notificationService
        .push({
          utilisateurId: userId,
          type: NotificationType.RETRAIT_TRAITE,
          titre: 'Retrait effectué',
          message: `Votre retrait de ${formatEur(Number(tx.montant))} a été versé sur votre compte bancaire.`,
          metadata: { transactionId: tx.id },
        })
        .catch(() => {});
    }
  }

  /**
   * `payout.failed` — le versement bancaire a échoué. Les fonds sont revenus
   * sur le solde du compte connecté ; pour ne pas double-créditer, on rapatrie
   * d'abord les fonds vers la plateforme (reversal du transfert) PUIS on
   * recrédite le wallet (idempotent). Si le reversal n'aboutit pas, on ne
   * recrédite pas à l'aveugle : alerte admin pour traitement manuel.
   *
   * Mapping via `payout.metadata.retraitTxId`. Un payout automatique sans
   * metadata est escaladé aux admins (recrédit manuel) plutôt que deviné.
   */
  private async handlePayoutFailed(event: any): Promise<void> {
    const payout = event.data.object;
    const accountId = event.account as string | undefined;
    const retraitTxId = payout?.metadata?.retraitTxId as string | undefined;

    if (!retraitTxId) {
      this.logger.warn(
        `payout.failed sans retraitTxId (payout automatique) payout=${payout?.id} account=${accountId} — revue manuelle`,
      );
      this.notificationService
        .pushToAdmins({
          type: NotificationType.RETRAIT_TRAITE,
          titre: 'Payout Stripe échoué — revue manuelle',
          message: `Un payout Stripe a échoué (payout=${payout?.id}, compte=${accountId}) sans référence de retrait. Vérifier et recréditer manuellement si besoin.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
          metadata: { payoutId: payout?.id, accountId },
        })
        .catch(() => {});
      return;
    }

    const tx = await this.txRepo.findOne({ where: { id: retraitTxId } });
    if (!tx || tx.type !== TransactionType.RETRAIT) {
      this.logger.warn(
        `payout.failed: retrait introuvable txId=${retraitTxId}`,
      );
      return;
    }
    const meta = tx.metadata ?? {};
    if (meta.recredited === true) {
      this.logger.debug(
        `payout.failed: retrait déjà recrédité (idempotent) tx=${tx.id}`,
      );
      return;
    }

    // Rapatrier les fonds (reversal) avant de recréditer, sinon double-crédit.
    const transferId = meta.transferId as string | undefined;
    if (transferId) {
      try {
        await this.stripeConnect.reverseTransfer(
          transferId,
          `retrait-reverse:${tx.id}`,
        );
      } catch (err) {
        this.logger.error(
          `payout.failed: reversal du transfert échoué tx=${tx.id} transfer=${transferId}: ${err?.message}`,
        );
        this.notificationService
          .pushToAdmins({
            type: NotificationType.RETRAIT_TRAITE,
            titre: 'Retrait — reversal échoué, revue manuelle',
            message: `Le payout du retrait ${tx.id} a échoué mais le reversal du transfert n'a pas abouti. Vérifier l'état Stripe avant tout recrédit manuel.`,
            roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
            metadata: {
              transactionId: tx.id,
              transferId,
              payoutId: payout?.id,
            },
          })
          .catch(() => {});
        return;
      }
    }

    const outcome = await this.requestRetrait.recreditRetrait(
      tx.id,
      `Payout Stripe échoué (payout=${payout?.id ?? 'inconnu'})`,
      TransactionStatus.ECHOUE,
    );
    if (outcome === 'recredited') {
      this.logger.log(`Retrait recrédité (payout.failed): tx=${tx.id}`);
      const userId = meta.userId as number | undefined;
      if (userId) {
        this.requestRetrait.notifyRetraitEchec(
          userId,
          Number(tx.montant),
          tx.id,
        );
      }
    }
  }
}
