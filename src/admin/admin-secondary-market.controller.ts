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
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { computeSecondaryMarketCommission } from 'src/secondarymarket/domains/commission';
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

    return { data: orders, total, page: Number(page), limit: Number(limit) };
  }

  // ── Annuler un ordre ─────────────────────────────────────────────────────────

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler un ordre (admin) — reverse complète si déjà exécuté' })
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

    // Cas A — ordre sans acheteur (EN_CARNET / MATCH_PROPOSE) : annulation simple
    if (
      ordre.statut === OrdreMarcheStatus.EN_CARNET ||
      (ordre.statut === OrdreMarcheStatus.MATCH_PROPOSE && !ordre.acheteurId)
    ) {
      ordre.statut = OrdreMarcheStatus.ANNULE;
      await this.ordreRepo.save(ordre);

      this.notificationService.push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "Ordre annulé par l'administration",
        message: "Votre annonce sur le marché secondaire a été annulée par l'équipe BeOwn.",
        metadata: { ordreId: id, reverse: false },
      }).catch(() => {});

      return { success: true, statut: OrdreMarcheStatus.ANNULE, reversed: false };
    }

    // Cas B — ordre EXECUTE (ou MATCH_PROPOSE avec acheteur) : reverse complète
    const nbFractions = ordre.nbFractions;
    const prixUnitaire = Number(ordre.prixUnitaire);
    const montantTotal = nbFractions * prixUnitaire;
    const projetId = ordre.investissement.projetId;
    const buyerUserId = ordre.acheteurId!;
    const sellerUserId = ordre.vendeurId;
    const commissionKey = `secmarket:commission:order:${id}`;

    await this.dataSource.transaction(async (em) => {
      // Lookup de la commission réellement prélevée pour cet ordre (legacy = 0)
      const commissionTx = await em.findOne(TransactionEntity, {
        where: { idempotencyKey: commissionKey, statut: TransactionStatus.REUSSI },
      });
      const commissionPrelevee = commissionTx ? Number(commissionTx.montant) : 0;
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
        devise: buyerWallet?.devise ?? sellerWallet?.devise ?? 'XOF',
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
      message: `Votre vente de ${nbFractions} fraction(s) à ${prixUnitaire} XOF a été annulée par l'administration. Les fractions ont été restaurées sur votre investissement.`,
      metadata: { ordreId: id, reverse: true, montantRestaure: montantTotal },
    }).catch(() => {});

    this.notificationService.push({
      utilisateurId: buyerUserId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: "Achat annulé — remboursement effectué",
      message: `L'achat de ${nbFractions} fraction(s) a été annulé par l'administration. ${montantTotal} XOF ont été recrédités sur votre wallet.`,
      metadata: { ordreId: id, reverse: true, montantRembourse: montantTotal },
    }).catch(() => {});

    return { success: true, statut: OrdreMarcheStatus.ANNULE, reversed: true, montantRembourse: montantTotal };
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
    const montantTotal = nbFractions * prixUnitaire;
    const commission = computeSecondaryMarketCommission(montantTotal);
    const montantNetVendeur = montantTotal - commission;
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

      // Réduire fractions vendeur
      const sellerInvest = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (sellerInvest && sellerInvest.nbTitres != null) {
        const remaining = Number(sellerInvest.nbTitres) - nbFractions;
        sellerInvest.nbTitres = Math.max(0, remaining);
        sellerInvest.montant = remaining > 0
          ? Number(sellerInvest.montant) - montantTotal
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

      // Commission plateforme — wallet system-wide créé à la volée si absent.
      let platformWallet: WalletEntity | null = null;
      if (commission > 0) {
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
        platformWallet.solde = Number(platformWallet.solde) + commission;
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
        fraisPlateforme: commission,
      }));

      // Ledger transaction commission plateforme
      if (platformWallet && commission > 0) {
        await em.save(TransactionEntity, em.create(TransactionEntity, {
          walletSource: null,
          walletDestination: platformWallet.id,
          type: TransactionType.SOUSCRIPTION,
          montant: commission,
          devise: platformWallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: ordre.investissementId,
          projetId,
          idempotencyKey: `secmarket:commission:order:${id}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
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
