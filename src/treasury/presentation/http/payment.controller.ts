import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
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
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { KycValidatedGuard } from 'src/compliance/presentation/guards/kyc-validated.guard';
import { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  CONNECT_GATEWAY,
  type ConnectGateway,
} from '../../application/ports/connect.gateway';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../../application/ports/payment.gateway';
import { OuvrirUnDepotUseCase } from '../../application/usecases/ouvrir-un-depot.usecase';
import { ConfirmerUnDepotUseCase } from '../../application/usecases/confirmer-un-depot.usecase';
import {
  DemanderUnRetraitUseCase,
  type IssueDuRetrait,
} from '../../application/usecases/demander-un-retrait.usecase';
import { TraiterUnEvenementStripeUseCase } from '../../application/usecases/traiter-un-evenement-stripe.usecase';
import { SynchroniserUnRetraitUseCase } from '../../application/usecases/synchroniser-un-retrait.usecase';
import {
  ConfirmDepotDto,
  ConnectOnboardingDto,
  CreatePaymentIntentDto,
  CreateRetraitDto,
} from './dto/payment.dto';

/**
 * Dépôts, retraits Stripe Connect, et l'endpoint webhook Stripe.
 *
 * **Le contrôleur route, il ne décide de rien** (§14). Il tenait auparavant
 * toute la logique financière du contexte : deux `Repository<…Entity>` TypeORM
 * et le `DataSource` injectés dans une classe de présentation, le crédit
 * atomique d'un dépôt écrit en `QueryBuilder`, le verrou pessimiste d'un
 * retrait, et cinq branches de webhook manipulant les colonnes à la main. Tout
 * cela est parti dans des use cases et derrière des ports — le contrôleur
 * traduit une requête HTTP en commande, et une issue en réponse.
 *
 * **Les formes de réponse sont inchangées**, y compris les refus rendus en
 * `202 { success: false, code }` plutôt qu'en `4xx`. Elles ne sont pas ce que
 * le contexte ferait aujourd'hui — les erreurs de domaine et leur filtre
 * existent (§21) — mais les déplacer casserait le front, et ce n'est pas ce
 * qu'un refactoring doit faire. La traduction est désormais au bon endroit
 * pour le jour où ce changement sera décidé.
 *
 * Les routes KYC ont quitté ce contrôleur avec leur contexte : voir
 * `KycController` (`/kyc/*`). Les anciennes URLs `/payments/kyc/*` restent
 * servies par `KycLegacyPaymentsController`, et sont dépréciées.
 */
@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(
    private readonly ouvrirUnDepot: OuvrirUnDepotUseCase,
    private readonly confirmerUnDepot: ConfirmerUnDepotUseCase,
    private readonly demanderUnRetrait: DemanderUnRetraitUseCase,
    private readonly traiterUnEvenement: TraiterUnEvenementStripeUseCase,
    private readonly synchroniser: SynchroniserUnRetraitUseCase,
    @Inject(PAYMENT_GATEWAY)
    private readonly paiements: PaymentGateway,
    @Inject(CONNECT_GATEWAY)
    private readonly connect: ConnectGateway,
    private readonly config: ConfigService,
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
    const paiement = await this.ouvrirUnDepot.execute({
      utilisateurId: user.userId,
      montant: Money.of(dto.amount, dto.currency),
      operationType: dto.operationType,
      projetId: dto.projetId,
    });

    // Les clés publiées sont celles d'avant : `amount` reste le montant dans la
    // plus petite unité, que le front passe tel quel à Stripe.
    return {
      clientSecret: paiement.clientSecret,
      intentId: paiement.intentId,
      status: paiement.statut,
      amount: paiement.montant.enCentimes(),
    };
  }

  @ApiOperation({ summary: 'Confirmer un dépôt et créditer le wallet' })
  @ApiResponse({ status: 200, description: 'Wallet crédité' })
  @ApiResponse({
    status: 403,
    description: 'KYC non validé, ou paiement d’un tiers',
  })
  @UseGuards(KycValidatedGuard)
  @HttpCode(HttpStatus.OK)
  @Post('depot/confirm')
  async confirmDepot(
    @Body() dto: ConfirmDepotDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const issue = await this.confirmerUnDepot.execute({
      utilisateurId: user.userId,
      paymentIntentId: dto.paymentIntentId,
    });

    switch (issue.issue) {
      case 'credite':
        return { success: true, walletId: issue.walletId };
      case 'deja-credite':
        return { success: true, alreadyProcessed: true };
      case 'paiement-non-abouti':
        return { success: false, status: issue.statut };
    }
  }

  // ─── Retrait Stripe Connect Express ───────────────────────────────────────

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

    const url = await this.connect.lienDOnboarding({
      utilisateurId: user.userId,
      email: user.email,
      retourUrl: dto.returnUrl ?? `${frontend}/dashboard/wallet?connect=done`,
      rafraichirUrl:
        dto.refreshUrl ?? `${frontend}/dashboard/wallet?connect=refresh`,
    });
    return { url };
  }

  @ApiOperation({
    summary: 'Statut du compte Stripe Connect de retrait',
    description:
      "Renvoie details_submitted / charges_enabled / payouts_enabled. Le retrait n'est possible que si payoutsEnabled=true.",
  })
  @ApiResponse({ status: 200, description: 'Statut du compte connecté' })
  @Get('connect/status')
  connectStatus(@CurrentUser() user: ActiveUser) {
    return this.connect.statutDuCompte(user.userId);
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
    const issue = await this.demanderUnRetrait.execute({
      utilisateurId: user.userId,
      montant: Money.of(dto.amount, dto.currency),
      walletId: dto.walletId,
      ibanDestination: dto.ibanDestination,
      cleDIdempotence: dto.idempotencyKey,
    });

    return rendreLIssueDuRetrait(issue);
  }

  @ApiOperation({
    summary: 'Relire un retrait chez le fournisseur et appliquer son sort',
    description:
      "Va chercher l'état du versement chez Stripe et l'applique au retrait, " +
      'sans attendre le webhook `payout.*`. Utile quand la plateforme n’est ' +
      'pas joignable depuis l’extérieur (poste de développement) ou après une ' +
      'livraison d’événement échouée. Sans effet sur un retrait déjà versé ou ' +
      'déjà recrédité — les gardes du domaine sont les mêmes que pour le ' +
      'webhook.',
  })
  @ApiParam({ name: 'transactionId', description: 'UUID du retrait' })
  @ApiResponse({ status: 200, description: 'État lu et suite donnée' })
  @ApiResponse({ status: 404, description: 'Retrait introuvable' })
  @HttpCode(HttpStatus.OK)
  @Post('retrait/:transactionId/synchroniser')
  synchroniserUnRetrait(
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    // Le titulaire est passé au use case, qui refuse un retrait qui n'est pas
    // le sien : ouvrir cette route sans cette garde donnerait de quoi sonder
    // les retraits des autres par leur identifiant.
    return this.synchroniser.execute(transactionId, user.userId);
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
    // Le corps **brut** : la signature porte sur les octets reçus, et un JSON
    // re-sérialisé n'est plus les mêmes octets.
    const requete = req as Request & { rawBody?: Buffer };
    const charge: Buffer =
      requete.rawBody ??
      (Buffer.isBuffer(requete.body)
        ? requete.body
        : Buffer.from(JSON.stringify(requete.body)));

    // La signature est éprouvée avant toute lecture du corps — c'est ce qui
    // protège aussi le contexte de conformité, avec qui l'endpoint est partagé.
    // Une signature invalide lève `SignatureWebhookInvalideError`, que le
    // filtre du contexte rend en 400 comme le faisait la `BadRequestException`.
    const evenement = this.paiements.authentifierLEvenement(charge, signature);

    await this.traiterUnEvenement.execute(evenement);

    return { received: true, type: evenement.type, eventId: evenement.id };
  }
}

/**
 * Traduit l'issue d'une demande de retrait dans la forme historique.
 *
 * Cette fonction est la trace exacte de ce que le contexte devrait rendre
 * autrement : trois de ces six issues sont des refus, et ils sortent en `202`
 * avec `success: false`. C'est le contrat en place ; le mettre à jour est une
 * décision produit, pas un effet de bord de ce refactoring.
 */
function rendreLIssueDuRetrait(issue: IssueDuRetrait): Record<string, unknown> {
  switch (issue.issue) {
    case 'en-route':
      return {
        success: true,
        transactionId: issue.transactionId,
        status: issue.statut,
        transferId: issue.transfertId,
        payoutId: issue.versementId,
      };
    case 'a-traiter-manuellement':
      return {
        success: true,
        transactionId: issue.transactionId,
        status: issue.statut,
      };
    case 'deja-demande':
      return {
        success: true,
        transactionId: issue.transactionId,
        status: issue.statut,
        alreadyProcessed: true,
      };
    case 'transfert-refuse':
      return {
        success: false,
        code: 'TRANSFER_FAILED',
        message: 'Le versement a échoué, votre solde a été recrédité.',
      };
    case 'compte-de-retrait-non-pret':
      return {
        success: false,
        code: 'CONNECT_NOT_READY',
        message:
          'Connectez votre compte de retrait Stripe pour effectuer un retrait.',
      };
    case 'solde-insuffisant':
      return { success: false, message: issue.motif };
  }
}
