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
  NotFoundException,
  Param,
  Post,
  Req,
  UseFilters,
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
  CreateApportPorteurDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
} from '../dto/payment.dto';
import { CrediterApportPorteurUseCase } from '../../applications/usecases/crediter-apport-porteur.usecase';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, EntityManager } from 'typeorm';
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
import { PayoutMethodExceptionFilter } from './payout-method-exception.filter';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { UpdateKycStatusUseCase } from 'src/profiles/applications/usecases/update-kyc-status.usecase';
import { KycStatus, KycNiveau } from 'src/profiles/domains/enums/kyc-status.enum';
import { PROFIL_REPOSITORY, type ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { TransactionalEmailNotifier } from 'src/shared/email/transactional-email.notifier';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';
import { GelDesAvoirsPort } from 'src/common/aml/gel-des-avoirs.port';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { resoudreUrlRedirection } from '../../domains/redirect-url';
import { KIND_VERSEMENT_PORTEUR } from 'src/wallets/applications/project-ledger.service';
import { RetraitSettlementService } from '../../applications/services/retrait-settlement.service';

/**
 * Palier de débit des routes qui ENGAGENT DE L'ARGENT (création d'intention de
 * paiement, demande de retrait). Dix par minute et par appelant : très au-delà
 * de tout usage humain — on ne crée pas dix dépôts par minute — et très en
 * deçà de ce qu'exige un balayage automatisé (sondage de montants, rejeu en
 * rafale, création d'intentions en masse chez le prestataire, qui coûtent de
 * l'argent réel même sans paiement abouti).
 *
 * Les TROIS paliers nommés sont redéfinis : `short` et `medium` sont des
 * filets globaux appliqués à chaque route, n'en resserrer qu'un laisserait
 * l'autre à sa valeur généreuse ; `auth` n'est évalué QUE là où il est posé
 * (cf. `app.module.ts` et `common/throttler/paliers.config.ts`), et le poser
 * ici est délibéré — ces routes déplacent de l'argent.
 */
const DEBIT_OPERATION_ARGENT = {
  short: { ttl: 60_000, limit: 10 },
  medium: { ttl: 60_000, limit: 10 },
  auth: { ttl: 60_000, limit: 10 },
} as const;

@ApiTags('Payments & KYC')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
// Les erreurs de moyen de versement (`PayoutMethodError`) sont des refus
// MÉTIER — dépassement du plafond de virement instantané, moyen inéligible.
// Sans ce filtre, elles n'étaient traduites nulle part sur ce contrôleur :
// elles ressortaient en 500 et remontaient dans Sentry comme des incidents,
// noyant les vrais. Le filtre est déjà posé sur `PayoutMethodsController` ;
// il manquait ici, alors que c'est ce contrôleur qui porte le retrait.
@UseFilters(PayoutMethodExceptionFilter)
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
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly requestRetrait: RequestRetraitUseCase,
    private readonly crediterApportPorteur: CrediterApportPorteurUseCase,
    private readonly metrics: MetricsPort,
    private readonly transactionalEmails: TransactionalEmailNotifier,
    private readonly amlMonitor: AmlMonitorService,
    // Clôture des retraits (payout payé / non abouti). Extraite du contrôleur
    // parce que le webhook n'est plus le seul déclencheur : le balayage de
    // rattrapage (`RetraitsReaperService`) doit clore EXACTEMENT de la même
    // façon quand l'événement n'a jamais été reçu.
    private readonly retraitSettlement: RetraitSettlementService,
    // Gel des avoirs (L. 562-4 CMF) — port DIP, en dernière position (les
    // specs construisent ce contrôleur à la main).
    private readonly gelDesAvoirs: GelDesAvoirsPort,
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

  /**
   * Valeur de `metadata.operationType` qui qualifie un encaissement d'apport
   * porteur. Elle est le SEUL discriminant entre les deux encaissements par
   * carte de la plateforme au retour du webhook — d'où sa déclaration unique
   * ici, partagée par la création de l'intention, la confirmation synchrone et
   * le traitement du webhook. Une divergence entre ces trois points enverrait
   * l'argent d'un projet sur le portefeuille personnel de son porteur.
   */
  private static readonly OPERATION_APPORT_PORTEUR = 'apport_porteur';

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
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_OPERATION_ARGENT)
  @UseGuards(KycValidatedGuard)
  @Post('depot/intent')
  async createDepotIntent(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: ActiveUser,
  ) {
    // ── Gel des avoirs — AVANT toute création d'intention chez le PSP ────────
    // Le gel bloque la CRÉATION du dépôt (aucune nouvelle opération sur le
    // compte) ; un PaymentIntent déjà payé chez Stripe reste, lui, crédité par
    // le webhook — refuser le crédit d'un paiement encaissé créerait un écart
    // de réconciliation (docs/adr/ADR-gel-des-avoirs.md). 403 AVOIRS_GELES.
    await this.gelDesAvoirs.assertAvoirsNonGeles(user.userId);
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

    this.transactionalEmails
      .depotConfirme(user.userId, amountMajor)
      .catch(() => {});
    this.surveillerAml(user.userId, amountMajor, 'depot', dto.paymentIntentId);

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
    const idempotencyKey = `depot:${paymentIntentId}`;
    let wallet: WalletEntity;
    try {
      wallet = await this.dataSource.transaction(async (em) => {
        // Le portefeuille est résolu — et créé s'il manque — DANS la
        // transaction. Hors d'elle, deux webhooks concurrents sur le même
        // compte neuf passaient tous deux le `findOne` à vide et créaient
        // DEUX portefeuilles : le crédit atterrissait sur l'un, le débit
        // suivant cherchait l'autre, et l'investisseur voyait « solde
        // insuffisant » sur un compte pourtant approvisionné. Le verrou
        // pessimiste sérialise les prétendants ; l'index unique partiel
        // `UQ_wallet_proprietaire_type` (cf. ADR migrations) ferme le dernier
        // interstice.
        const resolu = await this.resoudreWalletInvestisseur(em, userId);
        // 1. Insert ledger FIRST — la contrainte unique rejette tout doublon.
        //    ANO-02 : un dépôt CRÉDITE le portefeuille — l'écriture va donc en
        //    `walletDestination`, la source restant NULL (contrepartie externe :
        //    la carte de l'investisseur). L'inscrire côté débiteur faisait
        //    diverger le rapprochement « Σ crédits − Σ débits = solde ».
        await em.insert(TransactionEntity, {
          walletDestination: resolu.id,
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
          .where('id = :id', { id: resolu.id })
          .execute();
        return resolu;
      });
      return { credited: true, walletId: wallet.id };
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        // Dépôt déjà traité (violation d'unicité) → no-op idempotent. Le
        // portefeuille est relu hors transaction : celle-ci a été annulée,
        // mais le portefeuille, lui, existe forcément (le doublon porte sur la
        // clé du dépôt, pas sur le portefeuille).
        const existant = await this.walletRepo.findOne({
          where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
        });
        return { credited: false, walletId: existant?.id ?? '' };
      }
      throw err;
    }
  }

  /**
   * Portefeuille INVESTISSEUR d'un compte, créé s'il n'existe pas, sous verrou.
   *
   * `lock: pessimistic_write` sur la lecture : deux transactions concurrentes
   * ne peuvent pas conclure toutes deux à l'absence du portefeuille. Si la
   * course se joue malgré tout à la création (première insertion simultanée,
   * où il n'y a rien à verrouiller), l'index unique partiel tranche et le
   * perdant relit la ligne du gagnant.
   */
  private async resoudreWalletInvestisseur(
    em: EntityManager,
    userId: number,
  ): Promise<WalletEntity> {
    const existant = await em.findOne(WalletEntity, {
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      lock: { mode: 'pessimistic_write' },
    });
    if (existant) return existant;

    try {
      return await em.save(
        em.create(WalletEntity, {
          type: WalletType.INVESTISSEUR,
          proprietaireUserId: userId,
          fournisseurRef: `INV-${userId}-auto`,
          devise: 'EUR',
          solde: 0,
        }),
      );
    } catch (err: any) {
      if (err?.code !== '23505' && err?.driverError?.code !== '23505') throw err;
      const gagnant = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      });
      if (!gagnant) throw err;
      return gagnant;
    }
  }

  // ─── Apport du porteur (alimentation du projet) ───────────────────────────

  @ApiOperation({
    summary: 'Alimenter le portefeuille de son projet (Stripe PaymentIntent)',
    description:
      "Réservé au porteur du projet. C'est l'entrée d'argent qui finance le " +
      "service de la dette : sans elle, les règlements d'échéance créditent les " +
      'investisseurs sans contrepartie en trésorerie.',
  })
  @ApiResponse({
    status: 201,
    description: 'clientSecret retourné pour confirmation frontend',
  })
  @ApiResponse({ status: 403, description: 'Projet non porté par l’appelant' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_OPERATION_ARGENT)
  @UseGuards(KycValidatedGuard)
  @Post('porteur/apport/intent')
  async createApportPorteurIntent(
    @Body() dto: CreateApportPorteurDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertPorteurDuProjet(dto.projetId, user);

    // `operationType` est la SEULE chose qui distingue cet encaissement d'un
    // dépôt investisseur au retour du webhook. Le `projetId` posé ici désigne
    // le portefeuille bénéficiaire : il est écrit par le SERVEUR, après
    // vérification d'appartenance, et jamais relu depuis le client.
    return this.stripeService.createPaymentIntent({
      amount: dto.amount,
      currency: dto.currency,
      userId: user.userId,
      metadata: {
        operationType: PaymentController.OPERATION_APPORT_PORTEUR,
        projetId: dto.projetId,
        ...(dto.motif ? { motif: dto.motif } : {}),
      },
    });
  }

  @ApiOperation({
    summary: 'Confirmer un apport porteur et créditer le portefeuille du projet',
    description:
      'Chemin synchrone, doublé par le webhook `payment_intent.succeeded`. ' +
      'Les deux sont idempotents et partagent la même écriture.',
  })
  @ApiResponse({ status: 200, description: 'Portefeuille du projet crédité' })
  @ApiResponse({ status: 403, description: 'Paiement non détenu par l’appelant' })
  @UseGuards(KycValidatedGuard)
  @HttpCode(HttpStatus.OK)
  @Post('porteur/apport/confirm')
  async confirmApportPorteur(
    @Body() dto: ConfirmDepotDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const intent = await this.stripeService.retrievePaymentIntent(
      dto.paymentIntentId,
    );
    if (intent.status !== 'succeeded') {
      return { success: false, status: intent.status };
    }

    const projetId = await this.validerIntentionApportPorteur(
      intent,
      dto.paymentIntentId,
      user.userId,
    );
    if (!projetId) {
      throw new ForbiddenException(
        "Ce paiement n'est pas une alimentation de projet vous appartenant.",
      );
    }

    const montantEur = Number(intent.amount) / 100;
    const resultat = await this.crediterApportPorteur.execute({
      projetId,
      paymentIntentId: dto.paymentIntentId,
      montantEur,
      porteurUserId: user.userId,
      origine: 'confirm',
    });

    this.metrics.incrementCounter(METRIC.PORTEUR_APPORT_TOTAL, {
      source: 'confirm',
      outcome: resultat.credite ? 'credited' : 'already_processed',
    });
    if (!resultat.credite) {
      return { success: true, alreadyProcessed: true, projetId };
    }
    this.metrics.observeHistogram(METRIC.PORTEUR_APPORT_AMOUNT_EUR, montantEur, {
      source: 'confirm',
    });
    this.notifierApportPorteur(user.userId, projetId, montantEur);

    return {
      success: true,
      projetId,
      walletId: resultat.walletId,
      soldeProjet: resultat.soldeApres,
    };
  }

  /**
   * Vérifie que l'appelant porte bien le projet qu'il prétend alimenter.
   *
   * Contrôle d'APPARTENANCE, exécuté avant même la création de l'intention de
   * paiement : sans lui, n'importe quel compte pourrait créditer le
   * portefeuille d'un projet tiers et fausser son état financier — c'est-à-dire
   * le montant dû au porteur légitime. Les rôles habilités à décaisser
   * (`funds:disburse`) sont admis pour les régularisations du back-office.
   */
  private async assertPorteurDuProjet(
    projetId: string,
    user: ActiveUser,
  ): Promise<ProjectEntity> {
    const projet = await this.projectRepo.findOne({ where: { id: projetId } });
    if (!projet) throw new NotFoundException('Projet introuvable.');
    if (hasPermission(user.role, 'funds:disburse')) return projet;
    if (projet.porteurId !== user.userId) {
      this.logger.warn(
        `Apport porteur refusé : userId=${user.userId} n'est pas porteur du projet ${projetId}.`,
      );
      throw new ForbiddenException("Ce projet n'est pas rattaché à votre compte.");
    }
    return projet;
  }

  /**
   * Valide qu'une intention de paiement est bien un apport porteur exploitable,
   * et rend le projet visé.
   *
   * Trois conditions, toutes indispensables et toutes vérifiées côté serveur :
   * le type d'opération, l'appartenance du paiement à l'appelant (garde
   * anti-BOLA, identique au dépôt) et la devise (le crédit est libellé en EUR).
   *
   * @returns le `projetId` visé, ou `null` si l'intention ne qualifie pas.
   */
  private async validerIntentionApportPorteur(
    intent: { metadata?: Record<string, string>; currency?: string },
    paymentIntentId: string,
    userId: number,
  ): Promise<string | null> {
    const metadata = intent.metadata ?? {};
    if (metadata.operationType !== PaymentController.OPERATION_APPORT_PORTEUR) {
      return null;
    }
    if (metadata.userId !== String(userId)) {
      this.logger.warn(
        `Apport porteur refusé (appartenance) : appelant=${userId} ` +
        `propriétaire=${metadata.userId ?? 'inconnu'} pi=${paymentIntentId}`,
      );
      this.metrics.incrementCounter(METRIC.PORTEUR_APPORT_TOTAL, {
        source: 'confirm',
        outcome: 'rejected_ownership',
      });
      return null;
    }
    if (!this.isDeviseDepotAcceptee(intent.currency)) {
      this.logger.error(
        `Apport porteur refusé (devise) : "${intent.currency ?? 'inconnue'}" ≠ EUR ` +
        `pi=${paymentIntentId} userId=${userId}`,
      );
      this.metrics.incrementCounter(METRIC.PORTEUR_APPORT_TOTAL, {
        source: 'confirm',
        outcome: 'rejected_currency',
      });
      throw new BadRequestException(
        'Devise non supportée : seule la devise EUR est acceptée.',
      );
    }
    return metadata.projetId ?? null;
  }

  /** Informe le porteur et l'équipe financière d'une alimentation acquise. */
  private notifierApportPorteur(
    porteurUserId: number,
    projetId: string,
    montantEur: number,
  ): void {
    this.notificationService
      .push({
        utilisateurId: porteurUserId,
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Alimentation de projet confirmée',
        message: `Votre versement de ${formatEur(montantEur)} a été porté au crédit de votre projet.`,
        metadata: { projetId, montant: montantEur },
      })
      .catch(() => {});
    this.notificationService
      .pushToAdmins({
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Projet alimenté par son porteur',
        message: `Le projet ${projetId} a été alimenté de ${formatEur(montantEur)} par son porteur.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: { projetId, porteurUserId, montant: montantEur },
      })
      .catch(() => {});
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
    // `/dashboard/wallet` n'a jamais existé côté front : au retour d'onboarding,
    // Stripe déposait l'investisseur sur une 404. On le ramène sur son
    // portefeuille, qui porte le solde ET le panneau de retrait — c'est-à-dire
    // l'écran où il vient précisément d'obtenir le droit d'agir.
    //
    // ── Garde anti-redirecteur ouvert ────────────────────────────────────────
    // `returnUrl` / `refreshUrl` viennent du CORPS de la requête et sont
    // transmis à Stripe, qui s'engage à y renvoyer l'investisseur À LA SORTIE
    // de l'onboarding bancaire. Une origine étrangère y déposerait la victime
    // sur une page tierce atteinte par un lien portant le sceau de Stripe,
    // juste après la saisie de ses coordonnées de versement. Seules les
    // origines de l'exploitant sont acceptées ; tout le reste retombe
    // silencieusement sur le défaut (cf. domains/redirect-url.ts).
    const returnUrl = this.resoudreRedirectionConnect(
      dto.returnUrl,
      `${frontend}/dashboard/portfolio?connect=done`,
      user.userId,
      'returnUrl',
    );
    const refreshUrl = this.resoudreRedirectionConnect(
      dto.refreshUrl,
      `${frontend}/dashboard/portfolio?connect=refresh`,
      user.userId,
      'refreshUrl',
    );

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

  /**
   * Origines de redirection admises pour l'onboarding Connect : celles de
   * l'exploitant, exactement la liste qui gouverne déjà CORS. Une seule source
   * de vérité — déclarer une nouvelle façade se fait à un seul endroit, et ne
   * peut pas laisser cette garde en retard sur la configuration réelle.
   */
  private originesRedirectionAutorisees(): string[] {
    return [
      this.config.get<string>('FRONTEND_URL'),
      this.config.get<string>('ADMIN_URL'),
    ].filter((origine): origine is string => !!origine);
  }

  /** Applique l'allowlist et journalise tout refus (jamais restitué au client). */
  private resoudreRedirectionConnect(
    demandee: string | undefined,
    defaut: string,
    userId: number,
    champ: 'returnUrl' | 'refreshUrl',
  ): string {
    const { url, refusee } = resoudreUrlRedirection(
      demandee,
      defaut,
      this.originesRedirectionAutorisees(),
    );
    if (refusee) {
      this.logger.warn(
        `Onboarding Connect: ${champ} hors allowlist refusé pour userId=${userId} ` +
        `— repli sur l'URL par défaut.`,
      );
      this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
        event: 'redirect_rejected',
      });
    }
    return url;
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
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_OPERATION_ARGENT)
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
    } else if (event.type === 'payment_intent.payment_failed') {
      // Dépôt refusé par le prestataire → trace ECHOUE + information du déposant
      await this.handlePaymentIntentFailed(event);
    } else if (event.type === 'charge.refunded') {
      // Remboursement carte → débit du portefeuille, sans solde négatif
      await this.handleChargeRefunded(event);
    } else if (event.type === 'charge.dispute.created') {
      // Contestation bancaire (chargeback) → marquage + alerte Finance
      await this.handleChargeDisputeCreated(event);
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
    } else if (event.type === 'payout.canceled') {
      // Payout annulé : les fonds restent sur le compte connecté, exactement
      // comme après un échec → même discipline (reversal AVANT recrédit).
      await this.handlePayoutCanceled(event);
    } else if (event.type === 'transfer.reversed') {
      // Fonds déjà rapatriés vers la plateforme → recrédit direct du wallet
      await this.handleTransferReversed(event);
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

    if (isNaN(userId)) return;

    if (operationType === PaymentController.OPERATION_APPORT_PORTEUR) {
      await this.handleApportPorteurSucceeded(intent, userId);
      return;
    }
    if (operationType !== 'depot') return;

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
      this.transactionalEmails
        .depotConfirme(userId, amountMajor)
        .catch(() => {});
      this.surveillerAml(userId, amountMajor, 'depot', intent.id);
    }
  }

  /**
   * `payment_intent.succeeded` d'un APPORT PORTEUR — crédite le portefeuille
   * technique du projet visé, de façon atomique et idempotente.
   *
   * Deux gardes avant tout crédit, et aucune ne peut être omise :
   *  1. le projet visé doit exister ET être porté par le payeur. Le `projetId`
   *     a été écrit par le serveur à la création de l'intention, mais on le
   *     revérifie ici : entre-temps le projet a pu changer de porteur, et
   *     surtout ce chemin ne doit rien devoir à la confiance accordée à un
   *     autre chemin. Les rôles habilités à décaisser restent admis, pour les
   *     régularisations du back-office ;
   *  2. la devise, pour la même raison que le dépôt : le crédit est libellé en
   *     EUR (`amount / 100`), un encaissement en devise faible sur-créditerait
   *     le projet.
   *
   * On ne lève JAMAIS : Stripe rejouerait le webhook jusqu'à ~3 jours. Un refus
   * est journalisé, escaladé à Finance, et rien n'est écrit — l'argent est chez
   * le prestataire, la décision revient à un humain.
   */
  private async handleApportPorteurSucceeded(
    intent: any,
    porteurUserId: number,
  ): Promise<void> {
    const projetId = intent.metadata?.projetId as string | undefined;
    const montantEur = Number(intent.amount ?? 0) / 100;

    const refuser = (raison: string, message: string): void => {
      this.logger.error(
        `Webhook apport porteur refusé (${raison}) : pi=${intent.id} ` +
        `projet=${projetId ?? 'n/a'} userId=${porteurUserId}`,
      );
      this.metrics.incrementCounter(METRIC.PORTEUR_APPORT_TOTAL, {
        source: 'webhook',
        outcome: `rejected_${raison}`,
      });
      this.alerterFinance(
        'Alimentation de projet bloquée — vérification requise',
        message,
        {
          paymentIntentId: intent.id,
          projetId: projetId ?? null,
          porteurUserId,
          montant: montantEur,
        },
      );
    };

    if (!projetId) {
      refuser(
        'no_project',
        `Le paiement ${intent.id} (${formatEur(montantEur)}) se présente comme une alimentation ` +
          'de projet mais ne désigne aucun projet. Aucun portefeuille n\'a été crédité.',
      );
      return;
    }

    if (!this.isDeviseDepotAcceptee(intent.currency)) {
      refuser(
        'currency',
        `Le paiement ${intent.id} a réussi en devise "${intent.currency}" (≠ EUR) pour le projet ` +
          `${projetId}. Le portefeuille n'a PAS été crédité. Vérifier / rembourser côté Stripe.`,
      );
      return;
    }

    const projet = await this.projectRepo.findOne({ where: { id: projetId } });
    if (!projet) {
      refuser(
        'project_not_found',
        `Le paiement ${intent.id} (${formatEur(montantEur)}) vise le projet ${projetId}, introuvable. ` +
          'Aucun portefeuille n\'a été crédité.',
      );
      return;
    }
    if (projet.porteurId !== porteurUserId) {
      // Le rôle n'est pas relu ici : un webhook ne porte pas de session, et un
      // écart d'appartenance sur un encaissement déjà réalisé est précisément
      // ce qui doit remonter à un humain plutôt que d'être arbitré par un
      // automate.
      refuser(
        'ownership',
        `Le paiement ${intent.id} (${formatEur(montantEur)}) vise le projet ${projetId}, qui n'est pas ` +
          `porté par l'utilisateur #${porteurUserId}. Aucun portefeuille n'a été crédité.`,
      );
      return;
    }

    const resultat = await this.crediterApportPorteur.execute({
      projetId,
      paymentIntentId: intent.id,
      montantEur,
      porteurUserId,
      origine: 'webhook',
    });

    this.metrics.incrementCounter(METRIC.PORTEUR_APPORT_TOTAL, {
      source: 'webhook',
      outcome: resultat.credite ? 'credited' : 'already_processed',
    });
    if (!resultat.credite) return;

    this.metrics.observeHistogram(METRIC.PORTEUR_APPORT_AMOUNT_EUR, montantEur, {
      source: 'webhook',
    });
    this.notifierApportPorteur(porteurUserId, projetId, montantEur);
  }

  /**
   * Vigilance LCB-FT sur un mouvement de fonds (art. L.561-10 CMF).
   *
   * NON BLOQUANTE et NON ATTENDUE : une alerte déclenche une vigilance
   * renforcée côté compliance, jamais un gel. Faire dépendre la réponse d'un
   * webhook — ou pire, d'un dépôt — de la réussite de ce contrôle en ferait
   * un point de panne sur le chemin de l'argent, pour un traitement dont le
   * résultat n'est consommé par personne en temps réel.
   */
  private surveillerAml(
    userId: number,
    montant: number,
    contexte: 'depot' | 'retrait',
    reference?: string,
  ): void {
    this.amlMonitor
      .check({ userId, amount: montant, context: contexte, reference })
      .catch((err) =>
        this.logger.warn(
          `Contrôle LCB-FT "${contexte}" impossible pour l'utilisateur #${userId}: ${err?.message}`,
        ),
      );
  }

  /**
   * `payment_intent.payment_failed` — le paiement a été refusé (carte
   * refusée, authentification abandonnée, fonds insuffisants).
   *
   * Deux effets, tous deux idempotents :
   *  1. une écriture de dépôt ÉCHOUÉ est enregistrée, portant le motif renvoyé
   *     par le prestataire. Sans elle, un dépôt refusé ne laisse AUCUNE trace :
   *     l'investisseur voit son argent ne pas arriver et le support n'a rien à
   *     lui montrer. L'écriture est au statut ECHOUE, donc invisible de tous
   *     les agrégats du grand livre — qui ne somment que le REUSSI ;
   *  2. l'investisseur est prévenu, avec le motif.
   *
   * Garde essentielle : un PaymentIntent peut échouer sur une tentative PUIS
   * réussir sur la suivante. Si le dépôt est déjà crédité (clé `depot:<pi>`),
   * cet événement est un événement d'une tentative passée — no-op absolu.
   */
  private async handlePaymentIntentFailed(event: any): Promise<void> {
    const intent = event.data.object as any;
    const userId = parseInt(intent.metadata?.userId, 10);
    const operationType = intent.metadata?.operationType ?? 'depot';
    if (isNaN(userId) || operationType !== 'depot') return;

    const dejaCredite = await this.txRepo.findOne({
      where: { idempotencyKey: `depot:${intent.id}` },
    });
    if (dejaCredite) {
      this.logger.debug(
        `payment_intent.payment_failed ignoré : le dépôt ${intent.id} a finalement été crédité.`,
      );
      return;
    }

    const motifEchec =
      intent.last_payment_error?.message ??
      intent.last_payment_error?.code ??
      'Paiement refusé par le prestataire';
    const montant = Number(intent.amount ?? 0) / 100;

    // Portefeuille visé, s'il existe déjà : l'écriture apparaît alors dans
    // l'historique de l'investisseur. On n'en CRÉE pas pour un échec.
    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });

    try {
      await this.txRepo.insert({
        walletSource: null,
        walletDestination: wallet?.id ?? null,
        type: TransactionType.DEPOT,
        montant,
        devise: (intent.currency ?? 'eur').toUpperCase(),
        statut: TransactionStatus.ECHOUE,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: intent.id,
        // Clé distincte de `depot:<pi>` : une tentative ultérieure réussie
        // doit pouvoir créditer normalement sans buter sur cette écriture.
        idempotencyKey: `depot-echoue:${intent.id}`,
        motifEchec,
        metadata: { userId, paymentIntentId: intent.id },
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        return; // événement déjà traité — no-op idempotent
      }
      throw err;
    }

    this.metrics.incrementCounter(METRIC.DEPOSIT_REJECTED_TOTAL, {
      reason: 'payment_failed',
      source: 'webhook',
    });
    this.logger.log(
      `Dépôt échoué enregistré: userId=${userId} pi=${intent.id} motif=${motifEchec}`,
    );

    this.notificationService
      .push({
        utilisateurId: userId,
        type: NotificationType.DEPOT_CONFIRME,
        titre: 'Dépôt échoué',
        message:
          `Votre dépôt de ${formatEur(montant)} n'a pas abouti : ${motifEchec}. ` +
          'Aucun montant n\'a été débité. Vous pouvez réessayer.',
        metadata: { paymentIntentId: intent.id, montant, motif: motifEchec },
      })
      .catch(() => {});
  }

  /**
   * `charge.refunded` — le prestataire a remboursé un paiement encaissé. Les
   * fonds quittent la plateforme vers le moyen de paiement d'origine : le
   * portefeuille crédité au dépôt doit être débité d'autant, sans quoi
   * l'investisseur conserve un solde qui n'est plus couvert par la trésorerie.
   *
   * DEUX INTERDITS structurent ce traitement :
   *  - jamais deux débits pour un même remboursement : l'écriture porte la clé
   *    `refund:<chargeId>` (colonne unique ET `metadata.refundKey`), et c'est
   *    l'insertion qui garde le débit, pas l'inverse — un rejeu bute sur la
   *    contrainte avant d'avoir touché au solde ;
   *  - jamais de solde négatif : si l'investisseur a déjà dépensé les fonds
   *    remboursés, le débit est REFUSÉ et l'anomalie escaladée. Forcer le
   *    solde en négatif fabriquerait une créance silencieuse sur un
   *    utilisateur, invisible de tous les écrans.
   *
   * CLÉ PORTÉE PAR LE REMBOURSEMENT, PAS PAR LA CHARGE. Elle était
   * `refund:<chargeId>` et le montant valait `charge.amount_refunded`,
   * c'est-à-dire le CUMUL remboursé sur la charge. Deux conséquences sur un
   * remboursement partiel échelonné : le second événement butait sur la
   * contrainte d'unicité et n'était jamais débité — l'investisseur gardait un
   * solde que la trésorerie ne couvrait plus — tandis que le premier débitait
   * un cumul qui n'était pas encore sorti.
   *
   * Chaque remboursement de `charge.refunds.data` est donc traité pour SON
   * montant propre, sous SA clé. Reparcourir toute la liste à chaque événement
   * rend le traitement auto-réparateur : un événement manqué est rattrapé au
   * suivant, et ceux déjà traités butent simplement sur leur clé.
   */
  private async handleChargeRefunded(event: any): Promise<void> {
    const charge = event.data.object as any;
    const chargeId = charge?.id as string | undefined;
    if (!chargeId) return;

    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

    const depot = paymentIntentId
      ? await this.txRepo.findOne({
          where: { idempotencyKey: `depot:${paymentIntentId}` },
        })
      : null;

    const remboursements = this.remboursementsDeLaCharge(charge);
    if (remboursements.length === 0) return;

    if (!depot?.walletDestination) {
      // Remboursement d'un encaissement qui n'a jamais crédité de portefeuille
      // (dépôt refusé pour devise, paiement hors parcours…) : rien à débiter,
      // mais l'écart mérite un œil humain.
      const total =
        Math.round(
          remboursements.reduce((somme, r) => somme + r.montant, 0) * 100,
        ) / 100;
      this.logger.warn(
        `charge.refunded sans dépôt rattachable: charge=${chargeId} pi=${paymentIntentId ?? 'n/a'} — revue manuelle`,
      );
      this.alerterFinance(
        'Remboursement Stripe non rattaché à un dépôt',
        `Le remboursement de ${formatEur(total)} (charge ${chargeId}) ne correspond à aucun dépôt crédité. ` +
          'Vérifier côté Stripe avant tout ajustement manuel.',
        { chargeId, paymentIntentId: paymentIntentId ?? null, montant: total },
      );
      return;
    }

    for (const remboursement of remboursements) {
      await this.debiterRemboursement({
        walletId: depot.walletDestination,
        depot,
        chargeId,
        paymentIntentId: paymentIntentId ?? null,
        refundId: remboursement.id,
        montant: remboursement.montant,
      });
    }
  }

  /**
   * Remboursements exploitables d'une charge, chacun avec son identifiant et
   * son montant PROPRE.
   *
   * Repli documenté : certaines charges arrivent sans `refunds.data`
   * (payload élidé, ancien schéma). On retombe alors sur le cumul
   * `amount_refunded` sous la clé de la charge — l'ancien comportement, avec
   * sa limite, plutôt que de ne rien débiter du tout.
   */
  private remboursementsDeLaCharge(
    charge: any,
  ): Array<{ id: string; montant: number }> {
    const lignes: any[] = charge?.refunds?.data ?? [];

    if (Array.isArray(lignes) && lignes.length > 0) {
      return lignes
        .filter(
          (r) => r?.id && (!r.status || r.status === 'succeeded'),
        )
        .map((r) => ({ id: String(r.id), montant: Number(r.amount ?? 0) / 100 }))
        .filter((r) => r.montant > 0);
    }

    const cumul = Number(charge?.amount_refunded ?? 0) / 100;
    if (!(cumul > 0)) return [];
    this.logger.warn(
      `charge.refunded sans détail des remboursements (charge=${charge?.id}) : ` +
        'repli sur le cumul amount_refunded.',
    );
    return [{ id: String(charge.id), montant: cumul }];
  }

  /** Débit d'UN remboursement, sous sa propre clé d'idempotence. */
  private async debiterRemboursement(params: {
    walletId: string;
    depot: TransactionEntity;
    chargeId: string;
    paymentIntentId: string | null;
    refundId: string;
    montant: number;
  }): Promise<void> {
    const { walletId, depot, chargeId, paymentIntentId, refundId, montant } =
      params;
    const cleIdempotence = `refund:${refundId}`;
    const metadataEcriture = {
      refundKey: cleIdempotence,
      refundId,
      chargeId,
      paymentIntentId: paymentIntentId ?? '',
      depotTransactionId: depot.id,
    };

    let soldeInsuffisant = false;
    try {
      await this.dataSource.transaction(async (em) => {
        // 1. L'écriture d'abord : la contrainte d'unicité arrête tout rejeu
        //    AVANT que le solde ne bouge (même discipline que le dépôt).
        await em.insert(TransactionEntity, {
          walletSource: walletId,
          walletDestination: null, // contrepartie externe : la carte du client
          type: TransactionType.REMBOURSEMENT_DEPOT,
          montant,
          devise: depot.devise ?? 'EUR',
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.STRIPE,
          fournisseurRef: chargeId,
          idempotencyKey: cleIdempotence,
          metadata: metadataEcriture,
        });

        // 2. Débit CONDITIONNEL : `solde >= montant` interdit le négatif.
        const upd = await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde - :amount' })
          .setParameter('amount', montant)
          .where('id = :id AND solde >= :amount', { id: walletId, amount: montant })
          .execute();
        if (!upd.affected) {
          soldeInsuffisant = true;
          // Annule l'écriture REUSSI : elle affirmerait un débit qui n'a pas
          // eu lieu, et ferait diverger le rapprochement du grand livre.
          throw new Error('SOLDE_INSUFFISANT_REMBOURSEMENT');
        }
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        this.logger.debug(
          `remboursement déjà traité (idempotent): refund=${refundId}`,
        );
        return;
      }
      if (!soldeInsuffisant) throw err;
    }

    if (soldeInsuffisant) {
      await this.enregistrerRemboursementImpossible(
        walletId,
        montant,
        depot,
        chargeId,
        cleIdempotence,
        metadataEcriture,
      );
      return;
    }

    this.logger.log(
      `Remboursement débité: refund=${refundId} charge=${chargeId} ` +
        `wallet=${walletId} montant=${montant}`,
    );

    const userId = await this.proprietaireDuWallet(walletId);
    if (userId) {
      this.notificationService
        .push({
          utilisateurId: userId,
          type: NotificationType.DEPOT_CONFIRME,
          titre: 'Dépôt remboursé',
          message: `Un remboursement de ${formatEur(montant)} a été effectué vers votre moyen de paiement. Votre solde BeOwn a été ajusté en conséquence.`,
          metadata: { chargeId, montant },
        })
        .catch(() => {});
    }
  }

  /**
   * Consigne un remboursement qui n'a PAS pu être débité faute de solde, et
   * escalade. L'écriture est enregistrée au statut ECHOUE avec la même clé
   * d'idempotence : les redélivrances Stripe (jusqu'à ~3 jours) deviennent
   * des no-op, et l'alerte n'est levée qu'une fois. Le traitement passe alors
   * en manuel — c'est une décision de recouvrement, pas d'automate.
   */
  private async enregistrerRemboursementImpossible(
    walletId: string,
    montant: number,
    depot: TransactionEntity,
    chargeId: string,
    cleIdempotence: string,
    metadataEcriture: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.txRepo.insert({
        walletSource: walletId,
        walletDestination: null,
        type: TransactionType.REMBOURSEMENT_DEPOT,
        montant,
        devise: depot.devise ?? 'EUR',
        statut: TransactionStatus.ECHOUE,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: chargeId,
        idempotencyKey: cleIdempotence,
        motifEchec:
          'Solde insuffisant : débit du remboursement impossible sans rendre le solde négatif.',
        metadata: { ...metadataEcriture, soldeInsuffisant: true },
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') return;
      throw err;
    }

    this.logger.error(
      `Remboursement NON débité (solde insuffisant): charge=${chargeId} wallet=${walletId} montant=${montant}`,
    );
    this.alerterFinance(
      'Remboursement non débité — solde insuffisant',
      `Le remboursement de ${formatEur(montant)} (charge ${chargeId}) n'a pas pu être débité du portefeuille ${walletId} : ` +
        'le solde disponible est inférieur au montant remboursé. Aucun solde négatif n\'a été forcé. ' +
        'Traitement manuel requis (recouvrement ou régularisation).',
      { chargeId, walletId, montant },
    );
  }

  /**
   * `charge.dispute.created` — le porteur de carte conteste un paiement
   * (chargeback). L'argent sera prélevé d'office par le prestataire ; ce n'est
   * pas un mouvement que la plateforme décide, elle le subit.
   *
   * On ne débite donc RIEN ici : on MARQUE le dépôt concerné (le litige
   * devient visible dans l'historique et dans le back-office) et on alerte
   * Finance, seule à pouvoir décider de la contestation ou de la
   * régularisation. Idempotent sur l'identifiant du litige.
   */
  private async handleChargeDisputeCreated(event: any): Promise<void> {
    const dispute = event.data.object as any;
    const chargeId =
      typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    const paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id;
    const montant = Number(dispute.amount ?? 0) / 100;

    const depot = paymentIntentId
      ? await this.txRepo.findOne({
          where: { idempotencyKey: `depot:${paymentIntentId}` },
        })
      : null;

    if (depot) {
      const meta = (depot.metadata ?? {}) as Record<string, any>;
      if (meta.litige?.disputeId === dispute.id) {
        this.logger.debug(
          `charge.dispute.created déjà marqué (idempotent): dispute=${dispute.id}`,
        );
        return;
      }
      depot.metadata = {
        ...meta,
        litige: {
          disputeId: dispute.id,
          chargeId: chargeId ?? null,
          motif: dispute.reason ?? null,
          statut: dispute.status ?? null,
          montant,
          ouvertLe: new Date().toISOString(),
        },
      };
      await this.txRepo.save(depot);
    } else {
      this.logger.warn(
        `charge.dispute.created sans dépôt rattachable: dispute=${dispute.id} charge=${chargeId ?? 'n/a'}`,
      );
    }

    this.logger.error(
      `Litige bancaire ouvert: dispute=${dispute.id} charge=${chargeId ?? 'n/a'} montant=${montant} motif=${dispute.reason ?? 'n/a'}`,
    );
    this.alerterFinance(
      'Litige bancaire ouvert (chargeback)',
      `Une contestation de ${formatEur(montant)} a été ouverte (litige ${dispute.id}, charge ${chargeId ?? 'inconnue'}, motif « ${dispute.reason ?? 'non précisé'} »). ` +
        `Échéance de réponse à vérifier sans délai dans le tableau de bord Stripe.` +
        (depot ? '' : ' Aucun dépôt de la plateforme ne correspond à cette charge.'),
      {
        disputeId: dispute.id,
        chargeId: chargeId ?? null,
        paymentIntentId: paymentIntentId ?? null,
        montant,
        motif: dispute.reason ?? null,
        transactionId: depot?.id ?? null,
      },
    );
  }

  /** Escalade vers les rôles habilités à agir sur la trésorerie. */
  private alerterFinance(
    titre: string,
    message: string,
    metadata: Record<string, unknown>,
  ): void {
    this.notificationService
      .pushToAdmins({
        type: NotificationType.SECURITE,
        titre,
        message,
        roles: [UserRole.FINANCIER, UserRole.SUPER_ADMIN],
        metadata,
      })
      .catch(() => {});
  }

  /** Propriétaire d'un portefeuille, pour notifier le bon investisseur. */
  private async proprietaireDuWallet(walletId: string): Promise<number | null> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    return wallet?.proprietaireUserId ?? null;
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

    // L'utilisateur n'est pas devant son écran quand Stripe valide : sans
    // e-mail, il découvre son KYC validé à sa prochaine connexion — parfois
    // des jours après, alors qu'une collecte se ferme entre-temps.
    this.transactionalEmails.kycValide(userId).catch(() => {});

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
    // La séquence de clôture vit dans `RetraitSettlementService` : le balayage
    // de rattrapage doit pouvoir la rejouer à l'identique quand cet événement
    // n'a jamais été reçu.
    await this.retraitSettlement.cloturerRetraitPaye(
      event.data.object,
      event.account,
    );
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
    await this.retraitSettlement.denouerPayoutNonAbouti(event.data.object, event.account, {
      evenement: 'payout.failed',
      motif: `Payout Stripe échoué (payout=${event?.data?.object?.id ?? 'inconnu'})`,
      statutFinal: TransactionStatus.ECHOUE,
      declencheurMetrique: 'payout_failed',
    });
  }

  /**
   * `payout.canceled` — le versement a été annulé avant d'atteindre la banque.
   *
   * Situation IDENTIQUE à l'échec du point de vue de l'argent : les fonds sont
   * restés sur le solde du compte connecté. Recréditer le portefeuille sans
   * les avoir rapatriés donnerait deux fois la même somme à l'investisseur —
   * une fois sur son solde BeOwn, une fois sur son compte Stripe. Le même
   * dénouement s'applique donc, au libellé et au statut final près.
   */
  private async handlePayoutCanceled(event: any): Promise<void> {
    await this.retraitSettlement.denouerPayoutNonAbouti(event.data.object, event.account, {
      evenement: 'payout.canceled',
      motif: `Payout Stripe annulé (payout=${event?.data?.object?.id ?? 'inconnu'})`,
      statutFinal: TransactionStatus.ANNULE,
      declencheurMetrique: 'payout_canceled',
    });
  }

  /**
   * `transfer.reversed` — le transfert vers le compte connecté a été annulé et
   * les fonds sont REVENUS sur la plateforme.
   *
   * Contrairement à `payout.failed` / `payout.canceled`, il n'y a rien à
   * rapatrier : c'est déjà fait. Le portefeuille peut être recrédité
   * directement, via le mécanisme idempotent partagé — ce qui rend cet
   * événement inoffensif s'il arrive APRÈS un recrédit déjà effectué par le
   * chemin payout (cas nominal : c'est nous qui avons demandé ce reversal).
   */
  private async handleTransferReversed(event: any): Promise<void> {
    const transfer = event.data.object as any;
    const retraitTxId = transfer?.metadata?.retraitTxId as string | undefined;
    if (!retraitTxId) {
      this.logger.debug(
        `transfer.reversed sans retraitTxId transfer=${transfer?.id} — info`,
      );
      return;
    }

    const tx = await this.txRepo.findOne({ where: { id: retraitTxId } });
    if (!tx || tx.type !== TransactionType.RETRAIT) {
      this.logger.warn(
        `transfer.reversed: retrait introuvable txId=${retraitTxId}`,
      );
      return;
    }

    const outcome = await this.requestRetrait.recreditRetrait(
      tx.id,
      `Transfert Stripe annulé (transfer=${transfer?.id ?? 'inconnu'})`,
      TransactionStatus.ANNULE,
    );
    if (outcome !== 'recredited') {
      this.logger.debug(
        `transfer.reversed: retrait déjà dénoué (idempotent) tx=${tx.id}`,
      );
      return;
    }

    this.metrics.incrementCounter(METRIC.WITHDRAWAL_RECREDITED_TOTAL, {
      trigger: 'transfer_reversed',
    });
    this.logger.log(`Retrait recrédité (transfer.reversed): tx=${tx.id}`);

    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    const userId = meta.userId as number | undefined;
    if (userId) {
      this.requestRetrait.notifyRetraitEchec(userId, Number(tx.montant), tx.id);
    }
  }
}
