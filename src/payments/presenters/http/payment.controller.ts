import {
  BadRequestException,
  Body,
  Controller,
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
import { StripePaymentService } from '../../infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from '../../infrastructure/stripe-identity.service';
import {
  ConfirmDepotDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
} from '../dto/payment.dto';
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
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { UpdateKycStatusUseCase } from 'src/profiles/applications/usecases/update-kyc-status.usecase';
import { KycStatus, KycNiveau } from 'src/profiles/domains/enums/kyc-status.enum';
import { PROFIL_REPOSITORY, type ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

@SkipThrottle({ short: true, medium: true })
@ApiTags('Payments & KYC')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly stripeService: StripePaymentService,
    private readonly identityService: StripeIdentityServiceImpl,
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    private readonly notificationService: NotificationService,
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
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

    const amountMajor = Number(intent.amount) / 100;

    await this.walletRepo
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => `solde + ${amountMajor}` })
      .where('id = :id', { id: wallet.id })
      .execute();

    await this.txRepo.save(
      this.txRepo.create({
        walletId: wallet.id,
        type: TransactionType.DEPOT,
        montant: amountMajor,
        devise: 'XOF',
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: dto.paymentIntentId,
        idempotencyKey,
      }),
    );

    this.notificationService.push({
      utilisateurId: user.userId,
      type: NotificationType.DEPOT_CONFIRME,
      titre: 'Dépôt confirmé',
      message: `Votre dépôt de ${amountMajor} XOF a été crédité sur votre wallet.`,
      metadata: { paymentIntentId: dto.paymentIntentId, montant: amountMajor },
    }).catch(() => {});

    this.notificationService
      .pushToAdmins({
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Dépôt utilisateur',
        message: `User #${user.userId} a déposé ${amountMajor} XOF.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: { userId: user.userId, paymentIntentId: dto.paymentIntentId, montant: amountMajor },
      })
      .catch(() => {});

    return { success: true, walletId: wallet.id };
  }

  @ApiOperation({ summary: 'Initier un retrait vers compte bancaire' })
  @ApiResponse({
    status: 202,
    description:
      'Demande de retrait enregistrée (traitement manuel ou via Stripe Payouts)',
  })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @UseGuards(KycValidatedGuard)
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

    // Alerte aux admins (Financier) — un retrait attend traitement manuel
    this.notificationService
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Nouvelle demande de retrait',
        message: `L'utilisateur #${user.userId} a demandé un retrait de ${dto.amount} ${dto.currency} vers ${dto.ibanDestination}.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          userId: user.userId,
          transactionId: tx.id,
          amount: dto.amount,
          currency: dto.currency,
          ibanDestination: dto.ibanDestination,
        },
      })
      .catch(() => {});

    return { success: true, transactionId: tx.id, status: tx.statut };
  }

  // ─── KYC Stripe Identity ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Démarrer une session KYC Stripe Identity' })
  @ApiResponse({ status: 201, description: 'Session KYC créée — rediriger vers url' })
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
    }

    // Create Stripe Identity session
    const session = await this.identityService.createVerificationSession(
      user.userId,
      user.email,
    );

    // Persist session ID — status stays NON_DEMARRE until Stripe confirms photo capture (processing event)
    await this.profilRepository.updateKycSession(
      kyc.id,
      session.sessionId,
      KycStatus.NON_DEMARRE,
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
    const rawBody: Buffer = (req as any).rawBody
      ?? (req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body)));

    this.logger.debug(`Webhook rawBody length=${rawBody?.length}, sig present=${!!signature}`);

    let event: any;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.error(`Webhook signature failed: ${err.message}`);
      throw new BadRequestException(`Webhook signature invalide: ${err.message}`);
    }

    this.logger.log(`Stripe webhook: type=${event.type}, id=${event.id}`);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as any;
      const userId = parseInt(intent.metadata?.userId, 10);
      const operationType = intent.metadata?.operationType ?? 'depot';

      if (!isNaN(userId) && operationType === 'depot') {
        const idempotencyKey = `depot:${intent.id}`;
        const existing = await this.txRepo.findOne({ where: { idempotencyKey } });
        if (!existing) {
          let wallet = await this.walletRepo.findOne({
            where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
          });
          if (!wallet) {
            wallet = await this.walletRepo.save(
              this.walletRepo.create({
                type: WalletType.INVESTISSEUR,
                proprietaireUserId: userId,
                fournisseurRef: `INV-${userId}-auto`,
                devise: 'XOF',
                solde: 0,
              }),
            );
          }
          const amountMajor = Number(intent.amount) / 100;
          await this.walletRepo
            .createQueryBuilder()
            .update(WalletEntity)
            .set({ solde: () => `solde + ${amountMajor}` })
            .where('id = :id', { id: wallet.id })
            .execute();
          await this.txRepo.save(
            this.txRepo.create({
              walletId: wallet.id,
              type: TransactionType.DEPOT,
              montant: amountMajor,
              devise: 'XOF',
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.STRIPE,
              fournisseurRef: intent.id,
              idempotencyKey,
            }),
          );
          this.logger.log(`Wallet crédité: userId=${userId}, montant=${amountMajor}`);
          this.notificationService.push({
            utilisateurId: userId,
            type: NotificationType.DEPOT_CONFIRME,
            titre: 'Dépôt confirmé',
            message: `Votre dépôt de ${amountMajor} XOF a été crédité sur votre wallet.`,
            metadata: { paymentIntentId: intent.id, montant: amountMajor },
          }).catch(() => {});
        }
      }
    } else if (event.type === 'identity.verification_session.verified') {
      const session = event.data.object as any;
      const userId = parseInt(session.metadata?.userId, 10);
      if (!isNaN(userId)) {
        await this.updateKycStatus.execute(userId, KycStatus.VALIDE);
        this.logger.log(`KYC validé via Stripe Identity: userId=${userId}`);
        this.notificationService.push({
          utilisateurId: userId,
          type: NotificationType.KYC_VALIDE,
          titre: 'Identité vérifiée ✓',
          message: 'Votre vérification d\'identité a été validée. Vous pouvez désormais investir.',
        }).catch(() => {});

        // Retrieve report data + upload images to Cloudinary
        const sessionId = session.id;
        const reportData = await this.identityService.extractReportData(sessionId);
        if (reportData) {
          const kyc = await this.profilRepository.findKycByUserId(userId);
          if (kyc) {
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
      }
    } else if (event.type === 'identity.verification_session.processing') {
      // Stripe has captured all photos and started verification — mark as in progress
      const session = event.data.object as any;
      const userId = parseInt(session.metadata?.userId, 10);
      if (!isNaN(userId)) {
        await this.updateKycStatus.execute(userId, KycStatus.EN_COURS);
        this.logger.log(`KYC en cours (photos reçues) via Stripe Identity: userId=${userId}`);
      }
    } else if (event.type === 'identity.verification_session.requires_input') {
      // Stripe could not auto-verify — send to admin for manual review
      const session = event.data.object as any;
      const userId = parseInt(session.metadata?.userId, 10);
      if (!isNaN(userId)) {
        const motif =
          session.last_error?.reason ??
          session.last_error?.code ??
          'Vérification en attente de révision manuelle';
        await this.updateKycStatus.execute(userId, KycStatus.EN_REVUE, motif);
        this.logger.log(`KYC en revue (admin requis) via Stripe Identity: userId=${userId} motif=${motif}`);
        this.notificationService.push({
          utilisateurId: userId,
          type: NotificationType.KYC_REJETE,
          titre: 'Vérification KYC en attente de révision',
          message: `Votre vérification d'identité nécessite une révision manuelle. Motif : ${motif}`,
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
      }
    }

    return { received: true, type: event.type, eventId: event.id };
  }
}
