import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
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
import { ConfigService } from '@nestjs/config';
import { StripePaymentService } from '../../infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from '../../infrastructure/stripe-identity.service';
import { StripeConnectService } from '../../infrastructure/stripe-connect.service';
import type { ConnectAccountStatus } from '../../infrastructure/stripe-connect.service';
import { RequestRetraitUseCase } from '../../applications/usecases/request-retrait.usecase';
import {
  ConfirmDepotDto,
  ConnectOnboardingDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
} from '../dto/payment.dto';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { Public } from 'src/common/auth/public.decorator';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { hasPermission } from 'src/common/auth/permissions.constants';
import { formatEur } from 'src/shared/money/format-eur';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { UpdateKycStatusUseCase } from 'src/profiles/applications/usecases/update-kyc-status.usecase';
import { KycStatus, KycNiveau } from 'src/profiles/domains/enums/kyc-status.enum';
import { PROFIL_REPOSITORY, type ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

@ApiTags('Payments & KYC')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly stripeService: StripePaymentService,
    private readonly identityService: StripeIdentityServiceImpl,
    private readonly stripeConnect: StripeConnectService,
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    private readonly notificationService: NotificationService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly requestRetrait: RequestRetraitUseCase,
    private readonly metrics: MetricsPort,
  ) {}

  private async assertCanAccessKycSession(
    user: ActiveUser,
    sessionId: string,
  ): Promise<void> {
    if (hasPermission(user.role, 'kyc:validate')) return;

    const kyc = await this.profilRepository.findKycByUserId(user.userId);
    if (kyc?.fournisseurRef === sessionId) return;

    throw new ForbiddenException('Acces refuse.');
  }

  /**
   * Devise unique acceptée sur le chemin de dépôt (correctif C-2). BeOwn est un
   * PSFP français mono-devise : le crédit du wallet est TOUJOURS libellé en EUR
   * (`intent.amount / 100`, `devise: 'EUR'` codé en dur dans creditDepositAtomic).
   * Un PaymentIntent dans une autre devise (unité mineure différente) créditerait
   * donc le même nombre d'EUR pour une fraction du coût réel. Source de vérité
   * unique du contrôle, partagée par `confirmDepot` et le webhook.
   */
  private static readonly DEVISE_DEPOT_ACCEPTEE = 'eur';

  private isDeviseDepotAcceptee(currency?: string | null): boolean {
    return (
      (currency ?? '').toLowerCase() === PaymentController.DEVISE_DEPOT_ACCEPTEE
    );
  }

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
      this.metrics.incrementCounter(METRIC.DEPOSIT_REJECTED_TOTAL, {
        reason: 'bola_ownership_mismatch',
        source: 'confirm',
      });
      throw new ForbiddenException(
        'Ce paiement n\'appartient pas à votre compte.',
      );
    }

    // ── Garde anti-confusion de devise (C-2) ─────────────────────────────────
    // Le crédit ci-dessous est libellé en EUR (`amount / 100`). On refuse tout
    // PaymentIntent d'une autre devise, sinon un dépôt en devise faible (ex.
    // HUF : 50 000 fillér ≈ 1,3 €) créditerait 500 € pour ~1,3 € réellement
    // payés. Un appel légitime du front est toujours en EUR (verrou DTO en
    // amont) ; cette garde protège l'appel API direct.
    if (!this.isDeviseDepotAcceptee(intent.currency)) {
      this.logger.error(
        `Dépôt refusé (C-2): devise "${intent.currency ?? 'inconnue'}" ≠ EUR ` +
        `pi=${dto.paymentIntentId} userId=${user.userId}`,
      );
      this.metrics.incrementCounter(METRIC.DEPOSIT_REJECTED_TOTAL, {
        reason: 'currency_not_eur',
        source: 'confirm',
      });
      throw new BadRequestException(
        'Devise de dépôt non supportée : seule la devise EUR est acceptée.',
      );
    }

    const amountMajor = Number(intent.amount) / 100;

    // Crédit atomique + idempotent (H-A) — voir creditDepositAtomic.
    const { credited, walletId } = await this.creditDepositAtomic(
      user.userId,
      dto.paymentIntentId,
      amountMajor,
    );
    this.metrics.incrementCounter(METRIC.DEPOSITS_TOTAL, {
      source: 'confirm',
      outcome: credited ? 'credited' : 'already_processed',
    });
    if (!credited) return { success: true, alreadyProcessed: true };
    this.metrics.observeHistogram(METRIC.DEPOSIT_AMOUNT_EUR, amountMajor, {
      source: 'confirm',
    });

    this.notificationService.push({
      utilisateurId: user.userId,
      type: NotificationType.DEPOT_CONFIRME,
      titre: 'Dépôt confirmé',
      message: `Votre dépôt de ${formatEur(amountMajor)} a été crédité sur votre wallet.`,
      metadata: { paymentIntentId: dto.paymentIntentId, montant: amountMajor },
    }).catch(() => {});

    this.notificationService
      .pushToAdmins({
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Dépôt utilisateur',
        message: `User #${user.userId} a déposé ${formatEur(amountMajor)}.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: { userId: user.userId, paymentIntentId: dto.paymentIntentId, montant: amountMajor },
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
          walletId: wallet!.id,
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
          .where('id = :id', { id: wallet!.id })
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
    summary: 'Lien d\'onboarding Stripe Connect Express (compte de retrait)',
    description:
      "Crée si besoin le compte Connect Express de l'investisseur et renvoie une URL d'onboarding hébergée par Stripe. À vérifier en STAGING (clés live).",
  })
  @ApiResponse({ status: 201, description: '{ url } — rediriger le front vers cette URL' })
  @Post('connect/onboarding-link')
  async connectOnboardingLink(
    @Body() dto: ConnectOnboardingDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? '';
    const returnUrl = dto.returnUrl ?? `${frontend}/dashboard/wallet?connect=done`;
    const refreshUrl = dto.refreshUrl ?? `${frontend}/dashboard/wallet?connect=refresh`;

    const url = await this.stripeConnect.createAccountLink(
      user.userId,
      returnUrl,
      refreshUrl,
      user.email,
    );
    this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
      event: 'link_created',
    });
    return { url };
  }

  @ApiOperation({
    summary: 'Statut du compte Stripe Connect de retrait',
    description:
      'Renvoie details_submitted / charges_enabled / payouts_enabled. Le retrait n\'est possible que si payoutsEnabled=true.',
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

  // ─── KYC Stripe Identity ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Démarrer une session KYC Stripe Identity' })
  @ApiResponse({ status: 201, description: 'Session KYC créée — rediriger vers url' })
  @ApiResponse({
    status: 409,
    description: 'Dossier déjà tranché (validé ou refusé) — aucune session ouverte',
  })
  @Post('kyc/start')
  async startKyc(@CurrentUser() user: ActiveUser) {
    // Find or create KYC record
    let kyc = await this.profilRepository.findKycByUserId(user.userId);
    if (!kyc) {
      const newKyc = new Kyc();
      newKyc.utilisateurId = user.userId;
      newKyc.statut = KycStatus.NON_DEMARRE;
      newKyc.niveau = KycNiveau.STANDARD;
      newKyc.fournisseur = 'stripeIdentity';
      newKyc.scoreRisque = null;
      newKyc.fournisseurRef = null;
      newKyc.valideJusquAu = null;
      newKyc.motifRefus = null;
      kyc = await this.profilRepository.saveKyc(newKyc);
    } else if (PaymentController.KYC_START_BLOCKED.has(kyc.statut)) {
      // Dossier déjà tranché : ne rien rouvrir. Cf. KYC_START_BLOCKED.
      throw new ConflictException(
        kyc.statut === KycStatus.VALIDE
          ? 'Votre identité est déjà vérifiée.'
          : 'Votre dossier a été refusé — contactez le support.',
      );
    }

    // Create Stripe Identity session
    const session = await this.identityService.createVerificationSession(
      user.userId,
      user.email,
    );

    // Ouvrir une session n'est PAS une décision sur le dossier : on enregistre
    // la référence et on conserve le statut courant. Forcer NON_DEMARRE ici
    // effaçait une validation acquise (et, depuis EN_REVUE, le fallback manuel
    // en cours côté admin). Seuls les webhooks Identity et l'admin font
    // évoluer le statut.
    await this.profilRepository.updateKycSession(
      kyc.id,
      session.sessionId,
      kyc.statut,
    );

    this.logger.log(`KYC session créée: userId=${user.userId} sessionId=${session.sessionId}`);
    return session;
  }

  @ApiOperation({ summary: "Obtenir les images KYC de l'utilisateur courant (URLs signées Stripe, 1h)" })
  @ApiResponse({ status: 200, description: 'URLs signées ou null si pas de KYC validé' })
  @Get('kyc/images/me')
  async getMyKycImages(@CurrentUser() user: ActiveUser) {
    const kyc = await this.profilRepository.findKycByUserId(user.userId);
    if (!kyc?.identiteExtrait) return { available: false };

    const { documentFrontFileId, documentBackFileId, selfieFileId } = kyc.identiteExtrait as any;
    const images = await this.identityService.getImageUrls({ documentFrontFileId, documentBackFileId, selfieFileId });

    return {
      available: true,
      stripeReportId: kyc.stripeReportId,
      identiteExtrait: {
        nom: (kyc.identiteExtrait as any).nom,
        prenom: (kyc.identiteExtrait as any).prenom,
        dateNaissance: (kyc.identiteExtrait as any).dateNaissance,
        nationalite: (kyc.identiteExtrait as any).nationalite,
        typeDocument: (kyc.identiteExtrait as any).typeDocument,
        numeroDocument: (kyc.identiteExtrait as any).numeroDocument,
        dateExpiration: (kyc.identiteExtrait as any).dateExpiration,
      },
      images,
    };
  }

  @ApiOperation({ summary: "Obtenir les images KYC d'un utilisateur (admin)" })
  @ApiParam({ name: 'userId', description: 'ID numérique de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'URLs signées ou null si pas de KYC validé' })
  @Get('kyc/images/:userId')
  @RequirePermission('kyc:validate')
  async getKycImagesForUser(@Param('userId') userId: string) {
    const uid = parseInt(userId, 10);
    if (isNaN(uid)) throw new BadRequestException('userId invalide');
    const kyc = await this.profilRepository.findKycByUserId(uid);
    if (!kyc?.identiteExtrait) return { available: false };

    const { documentFrontFileId, documentBackFileId, selfieFileId } = kyc.identiteExtrait as any;
    const images = await this.identityService.getImageUrls({ documentFrontFileId, documentBackFileId, selfieFileId });

    return {
      available: true,
      stripeReportId: kyc.stripeReportId,
      identiteExtrait: kyc.identiteExtrait,
      images,
    };
  }

  @ApiOperation({ summary: "Consulter le statut d'une session KYC" })
  @ApiParam({
    name: 'sessionId',
    description: 'ID de la session Stripe Identity (vs_xxx)',
  })
  @ApiResponse({ status: 200, description: 'Statut de la session KYC' })
  @Get('kyc/session/:sessionId')
  async getKycSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertCanAccessKycSession(user, sessionId);
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
  async cancelKycSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertCanAccessKycSession(user, sessionId);
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
  @SkipThrottle({ short: true, medium: true, auth: true })
  @Post('webhook/stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    const rawBody: Buffer = (req as any).rawBody
      ?? (req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body)));

    this.logger.debug(`Webhook rawBody length=${rawBody?.length}, sig present=${!!signature}`);

    let event: any;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.error(`Webhook signature failed: ${err.message}`);
      this.metrics.incrementCounter(METRIC.WEBHOOK_SIGNATURE_INVALID_TOTAL, {
        provider: 'stripe',
      });
      throw new BadRequestException(`Webhook signature invalide: ${err.message}`);
    }

    this.logger.log(`Stripe webhook: type=${event.type}, id=${event.id}`);

    if (event.type === 'payment_intent.succeeded') {
      await this.handlePaymentIntentSucceeded(event);
    } else if (event.type === 'identity.verification_session.verified') {
      await this.handleIdentityVerified(event);
    } else if (event.type === 'identity.verification_session.processing') {
      await this.handleIdentityProcessing(event);
    } else if (event.type === 'identity.verification_session.requires_input') {
      await this.handleIdentityRequiresInput(event);
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

  // ─── Dépôt — helper webhook (crédit du wallet) ─────────────────────────────

  /**
   * `payment_intent.succeeded` — crédite le wallet du déposant, de façon
   * atomique et idempotente (H-A, cf. creditDepositAtomic). Deux gardes avant
   * tout crédit :
   *  1. Opération : seuls les intents `operationType=depot` (avec un userId
   *     exploitable) sont crédités ici.
   *  2. Devise (C-2) : le crédit est TOUJOURS libellé en EUR (`amount / 100`) ;
   *     un intent en devise ≠ EUR sur-créditerait le wallet. On NE throw PAS
   *     (Stripe rejouerait le webhook indéfiniment jusqu'à ~3 j) : on journalise
   *     en erreur, on escalade aux admins Finance, et on n'écrit rien.
   */
  private async handlePaymentIntentSucceeded(event: any): Promise<void> {
    const intent = event.data.object as any;
    const userId = parseInt(intent.metadata?.userId, 10);
    const operationType = intent.metadata?.operationType ?? 'depot';

    if (isNaN(userId) || operationType !== 'depot') return;

    if (!this.isDeviseDepotAcceptee(intent.currency)) {
      this.logger.error(
        `Webhook payment_intent.succeeded refusé (C-2): devise "${intent.currency ?? 'inconnue'}" ` +
        `≠ EUR pi=${intent.id} userId=${userId} — wallet NON crédité.`,
      );
      this.notificationService
        .pushToAdmins({
          type: NotificationType.DEPOT_CONFIRME,
          titre: 'Dépôt en devise non-EUR bloqué — vérification requise',
          message:
            `Le PaymentIntent ${intent.id} a réussi en devise "${intent.currency}" (≠ EUR) ` +
            `pour l'utilisateur #${userId}. Le wallet n'a PAS été crédité (protection C-2). ` +
            `Vérifier / rembourser côté Stripe.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
          metadata: { userId, paymentIntentId: intent.id, currency: intent.currency },
        })
        .catch(() => {});
      this.metrics.incrementCounter(METRIC.DEPOSIT_REJECTED_TOTAL, {
        reason: 'currency_not_eur',
        source: 'webhook',
      });
      return;
    }

    const amountMajor = Number(intent.amount) / 100;
    // Crédit atomique + idempotent partagé avec confirmDepot (H-A).
    const { credited } = await this.creditDepositAtomic(userId, intent.id, amountMajor);
    this.metrics.incrementCounter(METRIC.DEPOSITS_TOTAL, {
      source: 'webhook',
      outcome: credited ? 'credited' : 'already_processed',
    });
    if (credited) {
      this.metrics.observeHistogram(METRIC.DEPOSIT_AMOUNT_EUR, amountMajor, {
        source: 'webhook',
      });
      this.logger.log(`Wallet crédité: userId=${userId}, montant=${amountMajor}`);
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

  // ─── Stripe Identity — helpers webhook (validation auto + fallback revue manuelle) ──

  /**
   * Garde de transition anti-rejeu Stripe. Stripe redélivre les events
   * Identity dans le désordre jusqu'à ~3 jours après leur émission ; les
   * anciens gardes n'étaient keyés que sur (statut courant + session id),
   * ce qui n'arrêtait que les doublons immédiats. Un event tardif pouvait
   * donc écraser une décision manuelle définitive prise entretemps par un
   * admin (ex. `verified` tardif re-validant un dossier REFUSE — F1).
   *
   * Chaque event webhook n'a le droit de s'appliquer que si le statut
   * courant du dossier fait partie de ces statuts "amont" légitimes ;
   * sinon c'est un no-op journalisé (aucune écriture de statut, aucune
   * notification, aucun audit log). Les décisions manuelles (VALIDE /
   * REFUSE) sont donc toujours définitives vis-à-vis du webhook Stripe.
   *
   * RENOUVELLEMENT / EXPIRE : ces statuts sont réservés à un futur parcours
   * de re-vérification KYC périodique — aucun code du repo ne les
   * positionne encore (grep sur KycStatus.RENOUVELLEMENT/EXPIRE ne trouve
   * que la déclaration de l'enum et un test de guard). Leur sémantique
   * métier est cependant claire : le dossier doit repasser par une
   * nouvelle vérification Stripe Identity, exactement comme un dossier
   * qui n'a jamais été soumis. On les traite donc comme NON_DEMARRE pour
   * les trois events (verified/processing/requires_input) plutôt que de
   * les exclure — les exclure bloquerait silencieusement le futur parcours
   * de renouvellement le jour où il sera branché.
   */
  /**
   * Statuts terminaux : `kyc/start` refuse d'ouvrir une session depuis ceux-ci.
   * Cohérent avec la machine à états ci-dessous — ni VALIDE ni REFUSE ne figure
   * dans un `*_ALLOWED_FROM`, donc aucun event Identity ultérieur ne pourrait
   * leur être appliqué : ouvrir une session n'aurait servi qu'à faire refaire
   * le parcours à l'utilisateur pour rien.
   */
  private static readonly KYC_START_BLOCKED = new Set<KycStatus>([
    KycStatus.VALIDE,
    KycStatus.REFUSE,
  ]);

  private static readonly VERIFIED_ALLOWED_FROM = new Set<KycStatus>([
    KycStatus.NON_DEMARRE,
    KycStatus.EN_COURS,
    KycStatus.EN_REVUE, // retry légitime après un échec (requires_input) déjà en revue
    KycStatus.RENOUVELLEMENT,
    KycStatus.EXPIRE,
  ]);

  private static readonly REQUIRES_INPUT_ALLOWED_FROM = new Set<KycStatus>([
    KycStatus.NON_DEMARRE,
    KycStatus.EN_COURS,
    KycStatus.RENOUVELLEMENT,
    KycStatus.EXPIRE,
  ]);

  private static readonly PROCESSING_ALLOWED_FROM = new Set<KycStatus>([
    KycStatus.NON_DEMARRE,
    KycStatus.RENOUVELLEMENT,
    KycStatus.EXPIRE,
  ]);

  /**
   * Vrai si le statut courant autorise la transition demandée ; sinon log
   * un warning (event id + statut courant) et retourne false — l'appelant
   * doit alors `return` immédiatement sans aucun effet de bord.
   */
  private isIdentityTransitionAllowed(
    allowedFrom: ReadonlySet<KycStatus>,
    currentStatus: KycStatus,
    eventLabel: string,
    event: any,
    userId: number,
  ): boolean {
    if (allowedFrom.has(currentStatus)) return true;
    this.logger.warn(
      `Identity webhook ${eventLabel}: transition ignorée — statut actuel="${currentStatus}" ` +
      `non autorisé pour cet event (event=${event.id} userId=${userId}). ` +
      'Probable event Stripe redélivré/tardif après une décision manuelle — no-op.',
    );
    this.metrics.incrementCounter(METRIC.KYC_WEBHOOK_IGNORED_TOTAL, {
      event: eventLabel,
    });
    return false;
  }

  /**
   * Résout userId + dossier KYC associés à une session Stripe Identity.
   * Retourne null (no-op sûr) si userId absent des metadata ou si aucun
   * dossier KYC ne correspond — un event orphelin/tardif (ex. après
   * suppression de compte) ne doit jamais faire échouer le webhook.
   */
  private async resolveKycForIdentitySession(
    session: any,
  ): Promise<{ userId: number; kyc: Kyc } | null> {
    const userId = parseInt(session?.metadata?.userId, 10);
    if (isNaN(userId)) {
      this.logger.warn(
        `Identity webhook: userId manquant dans les metadata (session=${session?.id})`,
      );
      return null;
    }
    const kyc = await this.profilRepository.findKycByUserId(userId);
    if (!kyc) {
      this.logger.warn(
        `Identity webhook: KYC introuvable pour userId=${userId} (session=${session?.id}) — no-op`,
      );
      return null;
    }
    return { userId, kyc };
  }

  /**
   * `identity.verification_session.verified` — Stripe a validé automatiquement
   * l'identité : KYC → VALIDE, sans aucune action admin. Idempotent : une
   * redélivrance du même event (dossier déjà VALIDE pour cette session) est un
   * no-op qui évite de renotifier / re-télécharger les images / dupliquer
   * l'audit log.
   */
  private async handleIdentityVerified(event: any): Promise<void> {
    const session = event.data.object as any;
    const resolved = await this.resolveKycForIdentitySession(session);
    if (!resolved) return;
    const { userId, kyc } = resolved;

    if (kyc.statut === KycStatus.VALIDE && kyc.fournisseurRef === session.id) {
      this.logger.debug(
        `Identity webhook verified: déjà traité (idempotent) userId=${userId} session=${session.id}`,
      );
      return;
    }

    if (
      !this.isIdentityTransitionAllowed(
        PaymentController.VERIFIED_ALLOWED_FROM,
        kyc.statut,
        'verified',
        event,
        userId,
      )
    ) {
      return;
    }

    await this.updateKycStatus.execute(userId, KycStatus.VALIDE);
    this.metrics.incrementCounter(METRIC.KYC_TRANSITIONS_TOTAL, {
      to_status: 'valide',
      mode: 'auto',
    });
    this.logger.log(`KYC validé automatiquement via Stripe Identity: userId=${userId}`);

    this.notificationService.push({
      utilisateurId: userId,
      type: NotificationType.KYC_VALIDE,
      titre: 'Identité vérifiée',
      message: 'Votre vérification d\'identité a été validée. Vous pouvez désormais investir.',
    }).catch(() => {});

    this.auditLog
      .create(
        'stripe',
        'system',
        'kyc.auto_valide',
        'kyc',
        kyc.id,
        undefined,
        undefined,
        { source: 'stripe_identity', sessionId: session.id, eventId: event.id, userId },
      )
      .catch((err) => this.logger.warn(`Audit log KYC auto-validé échoué: ${err?.message}`));

    // Retrieve report data + upload images to Cloudinary
    const reportData = await this.identityService.extractReportData(session.id);
    if (reportData) {
      const folder = `kyc/${userId}`;

      // Upload images to Cloudinary in parallel (use Cloudinary URL as "fileId" going forward)
      const [frontUrl, backUrl, selfieUrl] = await Promise.all([
        reportData.documentFrontFileId
          ? this.identityService.downloadAndUploadToCloudinary(
              reportData.documentFrontFileId, folder, `kyc_front_${userId}.jpg`,
            )
          : Promise.resolve(undefined),
        reportData.documentBackFileId
          ? this.identityService.downloadAndUploadToCloudinary(
              reportData.documentBackFileId, folder, `kyc_back_${userId}.jpg`,
            )
          : Promise.resolve(undefined),
        reportData.selfieFileId
          ? this.identityService.downloadAndUploadToCloudinary(
              reportData.selfieFileId, folder, `kyc_selfie_${userId}.jpg`,
            )
          : Promise.resolve(undefined),
      ]);

      await this.profilRepository.updateKycReportData(kyc.id, reportData.reportId, {
        nom: reportData.nom,
        prenom: reportData.prenom,
        dateNaissance: reportData.dateNaissance,
        nationalite: reportData.nationalite,
        typeDocument: reportData.typeDocument,
        numeroDocument: reportData.numeroDocument,
        dateExpiration: reportData.dateExpiration,
        // Store Cloudinary URLs directly (fallback to Stripe file IDs if upload failed)
        documentFrontFileId: frontUrl ?? reportData.documentFrontFileId,
        documentBackFileId: backUrl ?? reportData.documentBackFileId,
        selfieFileId: selfieUrl ?? reportData.selfieFileId,
      });

      this.logger.log(
        `KYC report saved: userId=${userId} reportId=${reportData.reportId} ` +
        `cloudinary: front=${!!frontUrl} back=${!!backUrl} selfie=${!!selfieUrl}`,
      );
    }
  }

  /**
   * `identity.verification_session.processing` — Stripe a capturé les photos
   * et démarre la vérification automatique. Statut transitoire, idempotent
   * par construction (réaffecter EN_COURS est sans effet de bord).
   */
  private async handleIdentityProcessing(event: any): Promise<void> {
    const session = event.data.object as any;
    const resolved = await this.resolveKycForIdentitySession(session);
    if (!resolved) return;
    const { userId, kyc } = resolved;
    if (kyc.statut === KycStatus.EN_COURS) return; // idempotent no-op

    if (
      !this.isIdentityTransitionAllowed(
        PaymentController.PROCESSING_ALLOWED_FROM,
        kyc.statut,
        'processing',
        event,
        userId,
      )
    ) {
      return;
    }

    await this.updateKycStatus.execute(userId, KycStatus.EN_COURS);
    this.metrics.incrementCounter(METRIC.KYC_TRANSITIONS_TOTAL, {
      to_status: 'en_cours',
      mode: 'auto',
    });
    this.logger.log(`KYC en cours (photos reçues) via Stripe Identity: userId=${userId}`);
  }

  /**
   * `identity.verification_session.requires_input` — Stripe n'a pas pu
   * valider automatiquement : le dossier passe en revue manuelle (EN_REVUE),
   * l'utilisateur est invité à renvoyer ses documents, et Compliance/RCCI
   * sont alertés pour traiter le dossier via `PATCH /profiles/:userId/kyc/status`
   * (gaté aux dossiers EN_REVUE — cf. ProfileController.patchKycStatus).
   * Idempotent : une redélivrance du même event pour une session déjà en
   * revue manuelle est un no-op (pas de double notification).
   */
  private async handleIdentityRequiresInput(event: any): Promise<void> {
    const session = event.data.object as any;
    const resolved = await this.resolveKycForIdentitySession(session);
    if (!resolved) return;
    const { userId, kyc } = resolved;

    if (kyc.statut === KycStatus.EN_REVUE && kyc.fournisseurRef === session.id) {
      this.logger.debug(
        `Identity webhook requires_input: déjà en revue manuelle (idempotent) userId=${userId} session=${session.id}`,
      );
      return;
    }

    if (
      !this.isIdentityTransitionAllowed(
        PaymentController.REQUIRES_INPUT_ALLOWED_FROM,
        kyc.statut,
        'requires_input',
        event,
        userId,
      )
    ) {
      return;
    }

    const motif =
      session.last_error?.reason ??
      session.last_error?.code ??
      'Vérification en attente de révision manuelle';

    await this.updateKycStatus.execute(userId, KycStatus.EN_REVUE, motif);
    this.metrics.incrementCounter(METRIC.KYC_TRANSITIONS_TOTAL, {
      to_status: 'en_revue',
      mode: 'auto',
    });
    this.logger.log(
      `KYC en revue manuelle (Stripe Identity n'a pas pu valider automatiquement): userId=${userId} motif=${motif}`,
    );

    this.notificationService.push({
      utilisateurId: userId,
      type: NotificationType.KYC_REJETE,
      titre: 'Vérification KYC en attente de révision',
      message: `Votre vérification d'identité automatique n'a pas abouti. Merci de renvoyer vos documents. Motif : ${motif}`,
      metadata: { motif },
    }).catch(() => {});

    // Alerte aux admins (Compliance / RCCI) pour traitement manuel
    this.notificationService
      .pushToAdmins({
        type: NotificationType.KYC_REJETE,
        titre: 'KYC à réviser manuellement',
        message: `L'utilisateur #${userId} attend une révision manuelle de son KYC. Motif : ${motif}`,
        roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.RCCI],
        metadata: { userId, motif },
      })
      .catch(() => {});

    this.auditLog
      .create(
        'stripe',
        'system',
        'kyc.revue_manuelle_requise',
        'kyc',
        kyc.id,
        undefined,
        undefined,
        { source: 'stripe_identity', sessionId: session.id, eventId: event.id, userId, motif },
      )
      .catch((err) => this.logger.warn(`Audit log KYC revue manuelle échoué: ${err?.message}`));
  }

  // ─── Stripe Connect — helpers webhook (E3) ─────────────────────────────────

  /**
   * `account.updated` — Stripe notifie une évolution du compte connecté.
   * On rafraîchit les drapeaux en base (dont payoutsEnabled) et on prévient
   * l'investisseur si son compte de retrait vient d'être activé.
   */
  private async handleAccountUpdated(event: any): Promise<void> {
    const account = event.data.object as any;
    const { found, payoutsJustEnabled } =
      await this.stripeConnect.syncAccountFromWebhook(account);
    if (!found) return;

    this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
      event: 'account_updated',
    });

    this.logger.log(
      `account.updated: compte=${account.id} payouts_enabled=${!!account.payouts_enabled} ` +
      `details_submitted=${!!account.details_submitted}`,
    );

    if (payoutsJustEnabled) {
      this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
        event: 'payouts_enabled',
      });
      const user = await this.stripeConnect.findUserByConnectAccountId(account.id);
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
    const payout = event.data.object as any;
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
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    if (
      tx.statut === TransactionStatus.REUSSI ||
      tx.statut === TransactionStatus.ECHOUE ||
      meta.recredited === true
    ) {
      return; // idempotent / retrait déjà finalisé ou recrédité
    }

    tx.statut = TransactionStatus.REUSSI;
    await this.txRepo.save(tx);
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
      outcome: 'paid',
      reversal: 'false',
    });
    this.logger.log(`Retrait finalisé (payout.paid): tx=${tx.id} payout=${payout?.id}`);

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
    const payout = event.data.object as any;
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
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
        outcome: 'failed',
        reversal: 'no_reference',
      });
      return;
    }

    const tx = await this.txRepo.findOne({ where: { id: retraitTxId } });
    if (!tx || tx.type !== TransactionType.RETRAIT) {
      this.logger.warn(`payout.failed: retrait introuvable txId=${retraitTxId}`);
      return;
    }
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    if (meta.recredited === true) {
      this.logger.debug(`payout.failed: retrait déjà recrédité (idempotent) tx=${tx.id}`);
      return;
    }

    // Rapatrier les fonds (reversal) avant de recréditer, sinon double-crédit.
    const transferId = meta.transferId as string | undefined;
    if (transferId) {
      try {
        await this.stripeConnect.reverseTransfer(transferId, `retrait-reverse:${tx.id}`);
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
            metadata: { transactionId: tx.id, transferId, payoutId: payout?.id },
          })
          .catch(() => {});
        this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
          outcome: 'failed',
          reversal: 'reversal_failed',
        });
        return;
      }
    }

    const outcome = await this.requestRetrait.recreditRetrait(
      tx.id,
      `Payout Stripe échoué (payout=${payout?.id ?? 'inconnu'})`,
      TransactionStatus.ECHOUE,
    );
    this.metrics.incrementCounter(METRIC.WITHDRAWAL_PAYOUT_TOTAL, {
      outcome: 'failed',
      reversal: 'reversal_ok',
    });
    if (outcome === 'recredited') {
      this.metrics.incrementCounter(METRIC.WITHDRAWAL_RECREDITED_TOTAL, {
        trigger: 'payout_failed',
      });
      this.logger.log(`Retrait recrédité (payout.failed): tx=${tx.id}`);
      const userId = meta.userId as number | undefined;
      if (userId) {
        this.requestRetrait.notifyRetraitEchec(userId, Number(tx.montant), tx.id);
      }
    }
  }
}
