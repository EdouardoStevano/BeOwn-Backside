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
  GoneException,
  NotFoundException,
  ForbiddenException,
  UseFilters,
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
import {
  CreateOrdreMarcheDto,
  ExprimerInteretDto,
  InteretRecuDto,
} from '../dto/ordre-marche.dto';
import {
  OrdreMarcheStatus,
  OrdreMarcheSens,
} from 'src/secondarymarket/domains/ordre-marche';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { Public } from 'src/common/auth/public.decorator';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { InitiateBuyUseCase } from 'src/secondarymarket/applications/usecases/initiate-buy.usecase';
import { ExprimerInteretUseCase } from 'src/secondarymarket/applications/usecases/exprimer-interet.usecase';
import { RepondreInteretUseCase } from 'src/secondarymarket/applications/usecases/repondre-interet.usecase';
import {
  DUREE_DETENTION_MINIMALE_MOIS,
  MENTION_NON_SYSTEME_DE_NEGOCIATION,
  METHODE_PRIX_REFERENCE,
  PRIX_REFERENCE_CONTRAIGNANT,
  verifierEligibiliteMiseEnVente,
} from 'src/secondarymarket/domains/tableau-affichage';
import {
  DevisCession,
  DevisCessionService,
} from 'src/secondarymarket/applications/devis-cession.service';
import { CancelInitiationUseCase } from 'src/secondarymarket/applications/usecases/cancel-initiation.usecase';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { SIGNATURE_PROVIDER_UNAVAILABLE } from 'src/common/yousign/signature-provider.error';
import { SignatureProviderExceptionFilter } from 'src/common/yousign/signature-provider-exception.filter';

@SkipThrottle()
@ApiTags('Marché Secondaire')
@ApiBearerAuth()
// Une panne du prestataire de signature n'est pas un défaut de la plateforme :
// déclaré ici, le filtre couvre toutes les routes du contrôleur — celles qui
// déclenchent une signature aujourd'hui comme celles qui le feront demain.
@UseFilters(SignatureProviderExceptionFilter)
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
    private readonly devisCession: DevisCessionService,
  ) {}

  @Public()
  @ApiOperation({
    summary:
      "Annonces publiées sur le tableau d'affichage (public). Chaque annonce porte le devis de frais du vendeur.",
  })
  @Get('orders')
  async listOrders() {
    const ordres = await this.ordresWithRelations()
      .where('ord.statut = :statut', { statut: OrdreMarcheStatus.EN_CARNET })
      .orderBy('ord.createdAt', 'DESC')
      .getMany();
    return this.avecDevis(ordres);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mes annonces de vente (ordres du vendeur connecté)" })
  @Get('orders/mine')
  async myOrders(@CurrentUser() user: ActiveUser) {
    const ordres = await this.ordresWithRelations()
      .where('ord.vendeurId = :vendeurId', { vendeurId: user.userId })
      .orderBy('ord.createdAt', 'DESC')
      .getMany();
    return this.avecDevis(ordres);
  }

  /**
   * Marques d'intérêt reçues sur les annonces du demandeur.
   *
   * Le filtre `vendeurId = utilisateur courant` est posé dans la requête
   * elle-même : il n'existe aucun chemin par lequel un appelant puisse lire
   * l'intérêt reçu par un autre vendeur, y compris en devinant un identifiant.
   */
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Marques d'intérêt reçues sur mes annonces. Seule mon acceptation forme le contrat.",
  })
  @ApiResponse({ status: 200, type: [InteretRecuDto] })
  @Get('orders/mine/interets')
  async myReceivedInterests(
    @CurrentUser() user: ActiveUser,
  ): Promise<InteretRecuDto[]> {
    const ordres = await this.ordresWithRelations()
      .leftJoinAndMapOne(
        'ord.acheteur',
        UserEntity,
        'buyer',
        'buyer."userId" = ord."acheteurId"',
      )
      .where('ord.vendeurId = :vendeurId', { vendeurId: user.userId })
      .andWhere('ord.statut = :statut', {
        statut: OrdreMarcheStatus.INTERET_EXPRIME,
      })
      .orderBy('ord.interetExprimeLe', 'DESC')
      .getMany();

    // Une seule lecture de la grille de frais pour toute la liste : la page
    // entière est ainsi chiffrée sur des taux cohérents.
    const taux = await this.devisCession.chargerTaux();

    return Promise.all(
      ordres.map(async (ordre) => {
        const nbFractions = Number(ordre.interetNbFractions ?? 0);
        const prixUnitaire = Number(ordre.prixUnitaire);
        const acheteur = (ordre as any).acheteur as UserEntity | undefined;
        const projet = ordre.investissement?.projet;

        return {
          ordreId: ordre.id,
          statut: ordre.statut,
          projet: {
            id: projet?.id ?? '',
            slug: projet?.slug ?? '',
            titre: projet?.titre ?? '',
            ville: projet?.ville ?? null,
            statut: projet?.statut ?? '',
          },
          nbFractions,
          nbFractionsAnnonce: Number(ordre.nbFractions),
          prixUnitaire,
          montantIndicatif: Math.round(nbFractions * prixUnitaire * 100) / 100,
          exprimeLe: (ordre.interetExprimeLe ?? ordre.createdAt).toISOString(),
          acheteur: {
            prenom: acheteur?.firstname ?? 'Investisseur',
            initialeNom: acheteur?.lastname
              ? `${acheteur.lastname.charAt(0).toUpperCase()}.`
              : '',
          },
          devis: await this.devisCession.calculer(
            {
              nbFractions,
              prixUnitaire,
              prixRevientUnitaire: this.prixRevientVendeur(ordre.investissement),
            },
            taux,
          ),
        };
      }),
    );
  }

  /**
   * Attache à chaque annonce le devis de frais que supporterait son vendeur.
   * Les taux sont lus une seule fois pour toute la liste.
   */
  private async avecDevis(
    ordres: OrdreMarcheEntity[],
  ): Promise<Array<OrdreMarcheEntity & { devis: DevisCession }>> {
    if (ordres.length === 0) return [];
    const taux = await this.devisCession.chargerTaux();
    return Promise.all(
      ordres.map(async (ordre) => {
        const devis = await this.devisCession.calculer(
          {
            nbFractions: Number(ordre.nbFractions),
            prixUnitaire: Number(ordre.prixUnitaire),
            prixRevientUnitaire: this.prixRevientVendeur(ordre.investissement),
          },
          taux,
        );
        return Object.assign(ordre, { devis });
      }),
    );
  }

  /**
   * Prix de revient unitaire du vendeur, ou `null` s'il est inconnu.
   *
   * `valeurTitre` fait foi ; à défaut on le reconstitue depuis le montant
   * investi. Sans aucune des deux, on ne devine pas : la plus-value sera
   * réputée nulle plutôt que surestimée.
   */
  private prixRevientVendeur(
    investissement: InvestmentEntity | null | undefined,
  ): number | null {
    if (!investissement) return null;
    if (investissement.valeurTitre != null) return Number(investissement.valeurTitre);
    const titres = Number(investissement.nbTitres ?? 0);
    if (titres <= 0) return null;
    return Number(investissement.montant) / titres;
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
  @ApiOperation({
    summary:
      "Publier une annonce de vente. Refusée si la détention est inférieure à " +
      `${DUREE_DETENTION_MINIMALE_MOIS} mois ou si le projet n'est pas en exploitation.`,
  })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @ApiResponse({
    status: 400,
    description:
      'SECONDARY_HOLDING_TOO_RECENT (détention < 6 mois) ou ' +
      "SECONDARY_PROJECT_NOT_ELIGIBLE (projet hors exploitation).",
  })
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

      // ── Éligibilité à la mise en vente ────────────────────────────────────
      // Deux conditions annoncées publiquement — détention minimale et projet
      // en exploitation — appliquées ici, côté serveur : l'interface peut les
      // afficher, elle ne peut pas les garantir.
      const projet = await em.findOne(ProjectEntity, {
        where: { id: investment.projetId },
      });
      if (!projet) throw new NotFoundException('Projet introuvable');

      const eligibilite = verifierEligibiliteMiseEnVente({
        dateAcquisition: investment.createdAt,
        statutProjet: projet.statut,
        maintenant: new Date(),
      });
      if (!eligibilite.eligible) {
        throw new BadRequestException({
          code: eligibilite.code,
          message: eligibilite.motif,
          cessibleAPartirDu: eligibilite.cessibleAPartirDu.toISOString(),
        });
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

  /**
   * Ancienne exécution directe d'un ordre — DÉBRANCHÉE.
   *
   * Cette route prenait une annonce en carnet et, dans une seule transaction,
   * débitait l'acheteur, créditait le vendeur et transférait les fractions,
   * SANS que le vendeur ait jamais donné son accord. C'était un appariement
   * automatique : exactement ce que le tableau d'affichage exclut, et le
   * contraire de ce que la page publique du marché secondaire décrit.
   *
   * La route est conservée pour répondre explicitement aux clients qui
   * l'appellent encore — un 404 les laisserait croire à une panne. Elle ne lit
   * ni n'écrit plus rien : même l'existence de l'ordre n'est plus vérifiée,
   * pour qu'aucune information sur l'état du carnet ne fuie par ses codes de
   * réponse.
   *
   * Parcours de remplacement : POST orders/:id/interet → le vendeur consulte
   * GET orders/mine/interets → POST orders/:id/interet/acceptation (ou /refus).
   */
  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({
    summary:
      "DÉBRANCHÉE — l'exécution directe est remplacée par l'accord explicite du vendeur.",
    deprecated: true,
  })
  @ApiParam({ name: 'id', description: "UUID de l'ordre" })
  @ApiResponse({
    status: 410,
    description:
      "SECONDARY_EXECUTE_DISABLED — la cession passe par une marque d'intérêt " +
      'puis son acceptation par le vendeur.',
  })
  @Post('orders/:id/execute')
  executeOrder(): never {
    // Compté pour savoir si un client appelle encore le mécanisme retiré.
    // `reason` reste une valeur bornée (cardinalité Prometheus).
    this.metrics.incrementCounter(METRIC.SECONDARY_EXECUTION_FAILED_TOTAL, {
      reason: 'execute_disabled',
    });
    throw new GoneException({
      code: 'SECONDARY_EXECUTE_DISABLED',
      message:
        "L'achat immédiat n'existe plus sur le marché secondaire. Exprimez votre " +
        "intérêt sur l'annonce : la cession ne sera formée que si le vendeur " +
        "l'accepte explicitement.",
      parcours: {
        exprimerInteret: 'POST /secondary-market/orders/:id/interet',
        interetsRecus: 'GET /secondary-market/orders/mine/interets',
        acceptation: 'POST /secondary-market/orders/:id/interet/acceptation',
        refus: 'POST /secondary-market/orders/:id/interet/refus',
      },
    });
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
    @Body() dto: ExprimerInteretDto,
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
  @ApiResponse({
    status: 503,
    description:
      `${SIGNATURE_PROVIDER_UNAVAILABLE} — le prestataire de signature est ` +
      "indisponible (panne, abonnement expiré, délai dépassé). L'acceptation " +
      "n'est PAS enregistrée : l'annonce est ramenée en attente de réponse et " +
      "le vendeur peut réessayer à l'identique.",
  })
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
