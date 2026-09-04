import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { formatEur } from 'src/shared/money/format-eur';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { computeCoutAcquisition } from 'src/secondarymarket/domains/cout-acquisition';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';
import { round2 } from 'src/common/platform-fees/platform-fees.constants';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';

const ADMIN_ROLES = rolesWithPermission('market:manage');

@SkipThrottle()
@ApiTags('Admin — Marché Secondaire')
@ApiBearerAuth()
@Controller('admin/secondary-market')
@UseGuards(JwtAuthGuard)
@RequirePermission('market:manage')
export class AdminSecondaryMarketController {
  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    private readonly platformFees: PlatformFeesService,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const userEntity = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!userEntity || !ADMIN_ROLES.includes(userEntity.role as UserRole)) {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
  }

  // ── Liste tous les ordres avec relations ─────────────────────────────────────

  @Get('orders')
  @ApiOperation({ summary: 'Lister tous les ordres du marché secondaire' })
  @ApiQuery({ name: 'statut', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listOrders(
    @CurrentUser() user: ActiveUser,
    @Query('statut') statut?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    await this.assertAdmin(user);

    const skip = (Number(page) - 1) * Number(limit);

    const qb = this.ordreRepo
      .createQueryBuilder('ord')
      .leftJoinAndSelect('ord.investissement', 'inv')
      .leftJoinAndSelect('inv.projet', 'p')
      .leftJoinAndSelect('ord.vendeur', 'vendeur')
      .leftJoinAndMapOne(
        'ord.acheteur',
        UserEntity,
        'acheteur',
        'acheteur."userId" = ord."acheteurId"',
      )
      .orderBy('ord.createdAt', 'DESC')
      .skip(skip)
      .take(Number(limit));

    if (statut) qb.andWhere('ord.statut = :statut', { statut });

    const [orders, total] = await qb.getManyAndCount();

    return {
      data: orders.map((o) => this.projeterOrdre(o)),
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  /**
   * Projection d'un ordre pour le back-office.
   *
   * La route renvoyait les ENTITÉS jointes telles quelles : `vendeur` et
   * `acheteur` étaient des `UserEntity` complètes, ce qui publiait au carnet
   * d'ordres l'identifiant de compte Stripe Connect, la note PEP interne, le
   * motif de gel des avoirs, le taux d'imposition marginal, le code de
   * parrainage et le socialId de chaque contrepartie — aucun de ces champs
   * n'ayant de rapport avec la surveillance du marché. Pire : chaque colonne
   * ajoutée demain à `users` ou à `investments` rejoindrait la réponse sans
   * décision de personne.
   *
   * Les champs conservés sont exactement ceux que consomme le back-office
   * (`market.mapper.ts`) : identité de la contrepartie — légitime ici, la
   * route est gardée par `market:manage` —, caractéristiques de l'ordre et
   * contexte du projet.
   */
  private projeterOrdre(o: OrdreMarcheEntity) {
    const contrepartie = (u: UserEntity | null | undefined) =>
      u
        ? {
            userId: u.userId,
            firstname: u.firstname,
            lastname: u.lastname,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt,
          }
        : null;

    const inv = o.investissement as
      | (InvestmentEntity & { projet?: ProjectEntity })
      | undefined;

    return {
      id: o.id,
      investissementId: o.investissementId,
      vendeurId: o.vendeurId,
      acheteurId: o.acheteurId,
      sens: o.sens,
      nbFractions: o.nbFractions,
      montant: Number(o.montant),
      prixUnitaire: Number(o.prixUnitaire),
      statut: o.statut,
      interetNbFractions: o.interetNbFractions,
      interetExprimeLe: o.interetExprimeLe,
      accepteLe: o.accepteLe,
      valideJusquAu: o.valideJusquAu,
      createdAt: o.createdAt,
      vendeur: contrepartie(o.vendeur),
      acheteur: contrepartie((o as unknown as { acheteur?: UserEntity }).acheteur),
      investissement: inv
        ? {
            id: inv.id,
            projetId: inv.projetId,
            utilisateurId: inv.utilisateurId,
            montant: Number(inv.montant),
            nbTitres: inv.nbTitres,
            valeurTitre: inv.valeurTitre != null ? Number(inv.valeurTitre) : null,
            instrument: inv.instrument,
            statut: inv.statut,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
            projet: inv.projet
              ? {
                  id: inv.projet.id,
                  slug: inv.projet.slug,
                  titre: inv.projet.titre,
                  type: inv.projet.type,
                  ville: inv.projet.ville,
                  region: inv.projet.region,
                  pays: inv.projet.pays,
                  statut: inv.projet.statut,
                  instrument: inv.projet.instrument,
                }
              : null,
          }
        : null,
    };
  }

  // ── Annuler un ordre ─────────────────────────────────────────────────────────

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Annuler un ordre (admin) — reverse financière UNIQUEMENT si le statut est EXECUTE',
  })
  async cancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertAdmin(user);

    const ordre = await this.ordreRepo.findOne({
      where: { id },
      relations: ['investissement'],
    });
    if (!ordre) throw new NotFoundException('Ordre introuvable');

    if (ordre.statut === OrdreMarcheStatus.ANNULE || ordre.statut === OrdreMarcheStatus.EXPIRE) {
      throw new BadRequestException(`Ordre déjà au statut "${ordre.statut}"`);
    }

    // ── Cas A — la cession n'a JAMAIS été réglée : annulation simple ─────────
    //
    // La reverse financière défait un règlement : elle recrédite l'acheteur,
    // débite le vendeur du net qu'il avait reçu et rend les fractions. Sur un
    // ordre INTERET_EXPRIME ou ACCEPTE, RIEN de tout cela n'a eu lieu — aucun
    // wallet n'a bougé, aucune fraction n'a changé de main. La jouer quand même
    // (ancien comportement, qui traitait tout ce qui n'était pas « sans
    // acheteur » comme un règlement à défaire) créditait l'acheteur d'un
    // montant qu'il n'avait jamais versé et débitait le vendeur d'un produit
    // qu'il n'avait jamais perçu : de l'argent créé à chaque annulation.
    //
    // Seul EXECUTE ouvre donc la reverse. Tout le reste est annulé « à sec ».
    if (ordre.statut !== OrdreMarcheStatus.EXECUTE) {
      const liberation = await this.annulerSansMouvement(ordre);

      this.notificationService.push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "Ordre annulé par l'administration",
        message: "Votre annonce sur le marché secondaire a été annulée par l'équipe BeOwn.",
        metadata: { ordreId: id, reverse: false },
      }).catch(() => {});

      // L'acheteur pressenti doit savoir que son engagement tombe — et surtout
      // que les fonds réservés lui sont rendus.
      if (ordre.acheteurId) {
        this.notificationService.push({
          utilisateurId: ordre.acheteurId,
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Cession annulée par la plateforme',
          message:
            liberation.montantLibere > 0
              ? `La cession en cours a été annulée par l'équipe BeOwn. Les ${formatEur(liberation.montantLibere)} ` +
                'réservés sont de nouveau disponibles sur votre portefeuille.'
              : "La cession en cours a été annulée par l'équipe BeOwn. Aucun montant n'a été débité.",
          metadata: { ordreId: id, reverse: false },
        }).catch(() => {});
      }

      return {
        success: true,
        statut: OrdreMarcheStatus.ANNULE,
        reversed: false,
        montantLibere: liberation.montantLibere,
        signaturesAnnulees: liberation.signaturesAnnulees,
      };
    }

    // ── Cas B — ordre EXECUTE : reverse financière complète ──────────────────
    const nbFractions = ordre.nbFractions;
    const prixUnitaire = Number(ordre.prixUnitaire);
    const montantTotal = nbFractions * prixUnitaire;
    const projetId = ordre.investissement.projetId;
    const buyerUserId = ordre.acheteurId!;
    const sellerUserId = ordre.vendeurId;
    const commissionKey = `secmarket:commission:order:${id}`;

    await this.dataSource.transaction(async (em) => {
      // Lookup des frais réellement prélevés pour cet ordre :
      // - legacy : une seule tx commission `secmarket:commission:order:<id>` ;
      // - frais configurables : une tx par frais, retrouvées via
      //   metadata.ordreId + metadata.source (revente_transaction /
      //   gain_revente_actions). Ordres très anciens = 0.
      const legacyCommissionTx = await em.findOne(TransactionEntity, {
        where: { idempotencyKey: commissionKey, statut: TransactionStatus.REUSSI },
      });
      const feeTxs = await em
        .createQueryBuilder(TransactionEntity, 'tx')
        .where(`tx.metadata ->> 'ordreId' = :ordreId`, { ordreId: id })
        .andWhere(`tx.metadata ->> 'source' IN (:...sources)`, {
          sources: ['revente_transaction', 'gain_revente_actions'],
        })
        .andWhere('tx.statut = :statut', { statut: TransactionStatus.REUSSI })
        .getMany();

      // Un ordre peut avoir été rempli en plusieurs fois (fills successifs
      // sur le carnet EN_CARNET, tant que l'ordre n'est pas totalement
      // absorbé) : chaque fill webhook écrit ses frais avec un
      // metadata.signatureId qui lui est propre (yousign-webhook, étape 12).
      // L'état courant de l'ordre (nbFractions, acheteurId) ne reflète QUE le
      // DERNIER fill — reverser la somme des frais de TOUS les fills
      // suralimenterait le remboursement acheteur et sous-débiterait le
      // vendeur. On ne reverse donc que les frais du fill actuellement en
      // vigueur, identifié via la signature YouSign SIGNED (ordreId,
      // acheteurId) la plus récente. Un fill sans signature (force-execute
      // admin, metadata.signatureId absent) compte comme son propre groupe.
      const distinctSignatureIds = new Set(
        feeTxs
          .map((t) => (t.metadata as Record<string, unknown> | null)?.signatureId)
          .filter((v): v is string => typeof v === 'string'),
      );
      const hasUnsignedFeeTx = feeTxs.some(
        (t) => (t.metadata as Record<string, unknown> | null)?.signatureId == null,
      );
      const nbFillGroups = distinctSignatureIds.size + (hasUnsignedFeeTx ? 1 : 0);

      let scopedFeeTxs = feeTxs;
      if (nbFillGroups > 1) {
        const lastSignature = await em.findOne(SignatureEntity, {
          where: {
            ordreId: id,
            userId: buyerUserId,
            statut: SignatureStatus.SIGNED,
          },
          order: { signedAt: 'DESC' },
        });
        if (!lastSignature || !distinctSignatureIds.has(lastSignature.id)) {
          throw new BadRequestException(
            'Ordre multi-remplissages : annulation globale impossible, traiter par remplissage',
          );
        }
        scopedFeeTxs = feeTxs.filter(
          (t) =>
            (t.metadata as Record<string, unknown> | null)?.signatureId ===
            lastSignature.id,
        );
      }

      const commissionPrelevee = round2(
        (legacyCommissionTx ? Number(legacyCommissionTx.montant) : 0) +
          scopedFeeTxs.reduce((s, t) => s + Number(t.montant), 0),
      );
      const montantNetVendeurInitial = montantTotal - commissionPrelevee;

      // 1. Restaurer fractions vendeur sur son investissement source
      const sellerInvest = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (sellerInvest) {
        sellerInvest.nbTitres = (Number(sellerInvest.nbTitres) ?? 0) + nbFractions;
        sellerInvest.montant = Number(sellerInvest.montant) + montantTotal;
        if (sellerInvest.statut === InvestmentStatus.ANNULE) {
          sellerInvest.statut = InvestmentStatus.CONFIRME;
        }
        await em.save(InvestmentEntity, sellerInvest);
      }

      // 2. Retirer fractions sur investissement acheteur (fusionnel ou dédié)
      const buyerInvest = await em.findOne(InvestmentEntity, {
        where: { utilisateurId: buyerUserId, projetId, statut: InvestmentStatus.CONFIRME },
      });
      if (buyerInvest) {
        const newTitres = Math.max(0, (Number(buyerInvest.nbTitres) ?? 0) - nbFractions);
        buyerInvest.nbTitres = newTitres;
        buyerInvest.montant = Math.max(0, Number(buyerInvest.montant) - montantTotal);
        if (newTitres === 0) buyerInvest.statut = InvestmentStatus.ANNULE;
        await em.save(InvestmentEntity, buyerInvest);
      }

      // 3. Wallets : rembourser acheteur (montant total), débiter vendeur
      // (du net qu'il avait reçu), rembourser la commission depuis le wallet
      // plateforme s'il y en avait une de prélevée.
      const buyerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: buyerUserId, type: WalletType.INVESTISSEUR },
      });
      const sellerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: sellerUserId, type: WalletType.INVESTISSEUR },
      });
      if (buyerWallet) {
        buyerWallet.solde = Number(buyerWallet.solde) + montantTotal;
        await em.save(WalletEntity, buyerWallet);
      }
      if (sellerWallet) {
        sellerWallet.solde = Math.max(0, Number(sellerWallet.solde) - montantNetVendeurInitial);
        await em.save(WalletEntity, sellerWallet);
      }

      let platformWallet: WalletEntity | null = null;
      if (commissionPrelevee > 0) {
        platformWallet = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        if (platformWallet) {
          platformWallet.solde = Math.max(
            0,
            Number(platformWallet.solde) - commissionPrelevee,
          );
          await em.save(WalletEntity, platformWallet);
        }
      }

      // 4. Ledger transactions (reverse)
      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletSource: sellerWallet?.id ?? null,
        walletDestination: buyerWallet?.id ?? null,
        type: TransactionType.SOUSCRIPTION,
        montant: montantTotal,
        devise: buyerWallet?.devise ?? sellerWallet?.devise ?? 'EUR',
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        investissementId: ordre.investissementId,
        projetId,
        idempotencyKey: `admin-cancel-reverse:${id}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
      }));

      if (platformWallet && commissionPrelevee > 0) {
        await em.save(TransactionEntity, em.create(TransactionEntity, {
          walletSource: platformWallet.id,
          walletDestination: null,
          type: TransactionType.SOUSCRIPTION,
          montant: commissionPrelevee,
          devise: platformWallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: ordre.investissementId,
          projetId,
          idempotencyKey: `secmarket:commission-reverse:order:${id}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
        }));
      }

      // 5. Statut de l'ordre
      ordre.statut = OrdreMarcheStatus.ANNULE;
      await em.save(OrdreMarcheEntity, ordre);
    });

    // Notifications
    this.notificationService.push({
      utilisateurId: sellerUserId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: "Vente d'ordre refusée — fractions restaurées",
      message: `Votre vente de ${nbFractions} fraction(s) à ${formatEur(prixUnitaire)} a été annulée par l'administration. Les fractions ont été restaurées sur votre investissement.`,
      metadata: { ordreId: id, reverse: true, montantRestaure: montantTotal },
    }).catch(() => {});

    this.notificationService.push({
      utilisateurId: buyerUserId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: "Achat annulé — remboursement effectué",
      message: `L'achat de ${nbFractions} fraction(s) a été annulé par l'administration. ${formatEur(montantTotal)} ont été recrédités sur votre wallet.`,
      metadata: { ordreId: id, reverse: true, montantRembourse: montantTotal },
    }).catch(() => {});

    return { success: true, statut: OrdreMarcheStatus.ANNULE, reversed: true, montantRembourse: montantTotal };
  }

  /**
   * Annulation « à sec » d'un ordre jamais réglé.
   *
   * Aucun mouvement d'argent entre les parties et aucun mouvement de fractions :
   * il n'y a rien à défaire. Trois gestes seulement, dans une même transaction :
   *
   *  1. l'ordre passe ANNULE et perd toute trace d'acheteur — le laisser porter
   *     l'intérêt d'un tiers sur une annonce morte n'a aucun sens ;
   *  2. la signature encore PENDING est annulée — sans quoi l'acheteur pourrait
   *     signer un contrat sur une annonce que l'administration vient de retirer,
   *     et le webhook réglerait la cession ;
   *  3. les fonds RÉSERVÉS à l'acceptation sont rendus disponibles. Ce n'est pas
   *     un mouvement entre parties : l'argent ne quitte pas le portefeuille de
   *     l'acheteur, il repasse simplement de la poche bloquée à la poche
   *     disponible. Les fonds détenus sont inchangés — l'invariant du grand
   *     livre est intact. Ne pas le faire gèlerait cet argent sans terme.
   */
  private async annulerSansMouvement(ordre: OrdreMarcheEntity): Promise<{
    montantLibere: number;
    signaturesAnnulees: number;
  }> {
    const statutInitial = ordre.statut;
    const acheteurId = ordre.acheteurId;
    const montantReserve =
      statutInitial === OrdreMarcheStatus.ACCEPTE && ordre.interetNbFractions
        ? round2(Number(ordre.prixUnitaire) * Number(ordre.interetNbFractions))
        : 0;

    return this.dataSource.transaction(async (em) => {
      const annulation = await em
        .createQueryBuilder()
        .update(OrdreMarcheEntity)
        .set({
          statut: OrdreMarcheStatus.ANNULE,
          acheteurId: null,
          interetNbFractions: null,
          interetExprimeLe: null,
        })
        .where('id = :id AND statut = :statutInitial', {
          id: ordre.id,
          statutInitial,
        })
        .execute();
      if (!annulation.affected) {
        throw new BadRequestException(
          "L'ordre a changé d'état entre-temps : rechargez la fiche avant de réessayer.",
        );
      }

      const signatures = await em
        .createQueryBuilder()
        .update(SignatureEntity)
        .set({ statut: SignatureStatus.CANCELLED })
        .where('"ordreId" = :ordreId AND statut = :pending', {
          ordreId: ordre.id,
          pending: SignatureStatus.PENDING,
        })
        .execute();

      let montantLibere = 0;
      if (acheteurId && montantReserve > 0) {
        // Condition `soldeBloque >= :montant` : jamais de double libération,
        // jamais de solde bloqué négatif.
        const liberation = await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({
            solde: () => 'solde + :montant',
            soldeBloque: () => '"soldeBloque" - :montant',
          })
          .setParameter('montant', montantReserve)
          .where(
            '"proprietaireUserId" = :acheteurId AND type = :type AND "soldeBloque" >= :montant',
            {
              acheteurId,
              type: WalletType.INVESTISSEUR,
              montant: montantReserve,
            },
          )
          .execute();
        if (liberation.affected) montantLibere = montantReserve;
      }

      return { montantLibere, signaturesAnnulees: signatures.affected ?? 0 };
    });
  }

  // ── Forcer l'exécution d'un ordre MATCH_PROPOSE ──────────────────────────────

  @Post('orders/:id/force-execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forcer l\'exécution d\'un ordre MATCH_PROPOSE (admin)' })
  async forceExecute(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertAdmin(user);

    const ordre = await this.ordreRepo.findOne({
      where: { id },
      relations: ['investissement'],
    });
    if (!ordre) throw new NotFoundException('Ordre introuvable');
    if (ordre.statut !== OrdreMarcheStatus.MATCH_PROPOSE) {
      throw new BadRequestException(
        'Seuls les ordres au statut MATCH_PROPOSE peuvent être forcés',
      );
    }
    if (!ordre.acheteurId) {
      throw new BadRequestException('Aucun acheteur défini sur cet ordre');
    }

    const nbFractions = ordre.nbFractions;
    const prixUnitaire = Number(ordre.prixUnitaire);
    const montantTotal = round2(nbFractions * prixUnitaire);
    // Plus-value vendeur = prix de vente − coût d'acquisition (coût moyen
    // pondéré — voir domains/cout-acquisition.ts), calculée AVANT réduction
    // de l'investissement vendeur.
    const coutAcquisition = computeCoutAcquisition(
      ordre.investissement,
      nbFractions,
      prixUnitaire,
    );
    const plusValueVendeur = round2(montantTotal - coutAcquisition);
    // Frais vendeur depuis UN SEUL snapshot de taux (R1)
    const feeRates = await this.platformFees.getRates();
    const { transactionFee, gainFee } = await this.platformFees.computeResaleFees(
      montantTotal,
      plusValueVendeur,
      feeRates,
    );
    const totalFrais = round2(transactionFee + gainFee);
    const montantNetVendeur = round2(montantTotal - totalFrais);
    const projetId = ordre.investissement.projetId;
    const buyerUserId = ordre.acheteurId;

    const { buyerInvestId } = await this.dataSource.transaction(async (em) => {
      const buyerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: buyerUserId, type: WalletType.INVESTISSEUR },
      });
      if (!buyerWallet || Number(buyerWallet.solde) < montantTotal) {
        throw new BadRequestException('Solde acheteur insuffisant');
      }

      const sellerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: ordre.vendeurId, type: WalletType.INVESTISSEUR },
      });

      // Fusion ou nouvel investissement
      const existingInvest = await em.findOne(InvestmentEntity, {
        where: { utilisateurId: buyerUserId, projetId, statut: InvestmentStatus.CONFIRME },
      });

      let buyerInvest: InvestmentEntity;
      if (existingInvest) {
        existingInvest.nbTitres = (Number(existingInvest.nbTitres) ?? 0) + nbFractions;
        existingInvest.montant = Number(existingInvest.montant) + montantTotal;
        buyerInvest = await em.save(InvestmentEntity, existingInvest);
      } else {
        const newInvest = em.create(InvestmentEntity, {
          projetId,
          utilisateurId: buyerUserId,
          montant: montantTotal,
          instrument: ordre.investissement.instrument,
          nbTitres: nbFractions,
          valeurTitre: prixUnitaire,
          statut: InvestmentStatus.CONFIRME,
        });
        buyerInvest = await em.save(InvestmentEntity, newInvest);
      }

      // Réduire fractions vendeur — décrémenter du COÛT D'ACQUISITION des
      // parts cédées, jamais du prix de vente : le rapport montant/nbTitres
      // reste égal au coût moyen d'origine et la plus-value de la vente
      // SUIVANTE reste juste (même correctif que finalize-signed-contract
      // étape 5 — voir domains/cout-acquisition.ts). Décrémenter du prix de
      // vente déplaçait le coût moyen à chaque cession partielle et pouvait
      // rendre `montant` négatif sur une plus-value ; clamp à 0 par sûreté.
      const sellerInvest = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (sellerInvest && sellerInvest.nbTitres != null) {
        const remaining = Number(sellerInvest.nbTitres) - nbFractions;
        sellerInvest.nbTitres = Math.max(0, remaining);
        sellerInvest.montant = remaining > 0
          ? Math.max(0, round2(Number(sellerInvest.montant) - coutAcquisition))
          : 0;
        await em.save(InvestmentEntity, sellerInvest);
      }

      // Clore l'ordre
      ordre.statut = OrdreMarcheStatus.EXECUTE;
      await em.save(OrdreMarcheEntity, ordre);

      // Mouvements wallet
      buyerWallet.solde = Number(buyerWallet.solde) - montantTotal;
      await em.save(WalletEntity, buyerWallet);
      if (sellerWallet) {
        sellerWallet.solde = Number(sellerWallet.solde) + montantNetVendeur;
        await em.save(WalletEntity, sellerWallet);
      }

      // Frais plateforme — wallet system-wide créé à la volée si absent.
      let platformWallet: WalletEntity | null = null;
      if (totalFrais > 0) {
        platformWallet = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        if (!platformWallet) {
          platformWallet = await em.save(
            WalletEntity,
            em.create(WalletEntity, {
              type: WalletType.FRAIS_PLATEFORME,
              proprietaireUserId: null,
              fournisseurRef: 'PLAT-FEES-001',
              devise: buyerWallet.devise,
              solde: 0,
            }),
          );
        }
        platformWallet.solde = Number(platformWallet.solde) + totalFrais;
        await em.save(WalletEntity, platformWallet);
      }

      // Ledger transactions (buyer débité)
      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletSource: buyerWallet.id,
        walletDestination: sellerWallet?.id ?? null,
        type: TransactionType.SOUSCRIPTION,
        montant: montantTotal,
        devise: buyerWallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        investissementId: buyerInvest.id,
        projetId,
        idempotencyKey: `admin-force:buyer:${id}`,
        fraisPsp: 0,
        fraisPlateforme: totalFrais,
      }));

      // Ledger frais plateforme — une transaction PAR frais (metadata.source),
      // retrouvables au reverse admin via metadata.ordreId.
      if (platformWallet && transactionFee > 0) {
        await em.save(TransactionEntity, em.create(TransactionEntity, {
          walletSource: null,
          walletDestination: platformWallet.id,
          type: TransactionType.SOUSCRIPTION,
          montant: transactionFee,
          devise: platformWallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: ordre.investissementId,
          projetId,
          idempotencyKey: `secmarket:fee:revente_transaction:order:${id}:admin`,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: { source: 'revente_transaction', ordreId: id },
        }));
      }
      if (platformWallet && gainFee > 0) {
        await em.save(TransactionEntity, em.create(TransactionEntity, {
          walletSource: null,
          walletDestination: platformWallet.id,
          type: TransactionType.SOUSCRIPTION,
          montant: gainFee,
          devise: platformWallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: ordre.investissementId,
          projetId,
          idempotencyKey: `secmarket:fee:gain_revente_actions:order:${id}:admin`,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: {
            source: 'gain_revente_actions',
            ordreId: id,
            plusValueVendeur,
            coutAcquisition,
          },
        }));
      }

      return { buyerInvestId: buyerInvest.id };
    });

    const project = await this.projectRepo.findOne({ where: { id: projetId } });
    const buyerUser = await this.userRepo.findOne({ where: { userId: buyerUserId } });
    const sellerUser = await this.userRepo.findOne({ where: { userId: ordre.vendeurId } });
    if (project && buyerUser && sellerUser) {
      await this.notificationEvents.secondaryTradeExecuted(
        ordre, project, buyerUser, sellerUser, nbFractions,
      );
    }

    return { success: true, buyerInvestId };
  }
}
