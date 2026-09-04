import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { Wallet } from 'src/wallets/domains/wallet';
import { Transaction } from 'src/wallets/domains/transaction';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { hasPermission } from 'src/common/auth/permissions.constants';
import {
  TransactionFournisseur,
  TransactionStatus,
  TYPES_WALLET_PLATEFORME,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { CreateTransactionDto, CreateWalletDto } from '../dto/wallet.dto';

@ApiTags('Wallets & Transactions')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly auditLog: AuditLogService,
  ) {}

  private canManageWallets(user: ActiveUser): boolean {
    return hasPermission(user.role, 'platform:wallet');
  }

  private assertCanReadWallet(user: ActiveUser, wallet: Wallet): void {
    if (wallet.proprietaireUserId === user.userId) return;
    if (this.canManageWallets(user)) return;
    throw new ForbiddenException('Acces refuse.');
  }

  @ApiOperation({ summary: 'Créer un wallet' })
  @ApiResponse({ status: 201, description: 'Wallet créé' })
  @Post()
  @RequirePermission('platform:wallet')
  async createWallet(@Body() dto: CreateWalletDto): Promise<Wallet> {
    const wallet = new Wallet();
    wallet.type = dto.type;
    wallet.proprietaireUserId = null;
    wallet.projetId = null;
    wallet.spvId = null;
    wallet.fournisseurRef = dto.fournisseurRef;
    wallet.devise = dto.devise ?? 'EUR';
    wallet.solde = 0;
    wallet.statut = 'actif';
    return this.walletRepository.saveWallet(wallet);
  }

  @ApiOperation({ summary: "Wallet d'un utilisateur" })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Wallet trouvé' })
  @ApiResponse({ status: 404, description: 'Wallet introuvable' })
  @Get('user/:userId')
  async getUserWallet(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: ActiveUser,
  ): Promise<Wallet> {
    if (user.userId !== userId && !this.canManageWallets(user)) {
      throw new ForbiddenException('Acces refuse.');
    }

    let wallet = await this.walletRepository.findWalletByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (!wallet) {
      if (user.userId !== userId) {
        throw new NotFoundException('Wallet introuvable.');
      }
      const newWallet = new Wallet();
      newWallet.type = WalletType.INVESTISSEUR;
      newWallet.proprietaireUserId = userId;
      newWallet.projetId = null;
      newWallet.spvId = null;
      newWallet.fournisseurRef = `INV-${userId}-auto`;
      newWallet.devise = 'EUR';
      newWallet.solde = 0;
      newWallet.statut = 'actif';
      wallet = await this.walletRepository.saveWallet(newWallet);
    }
    return wallet;
  }

  @ApiOperation({ summary: "Détail d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Wallet trouvé' })
  @ApiResponse({ status: 404, description: 'Wallet introuvable' })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<Wallet> {
    const wallet = await this.walletRepository.findWalletById(id);
    if (!wallet) throw new NotFoundException('Wallet introuvable.');
    this.assertCanReadWallet(user, wallet);
    return wallet;
  }

  @ApiOperation({ summary: "Transactions d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Liste des transactions' })
  @Get(':id/transactions')
  async getTransactions(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<Transaction[]> {
    const wallet = await this.walletRepository.findWalletById(id);
    if (!wallet) throw new NotFoundException('Wallet introuvable.');
    this.assertCanReadWallet(user, wallet);
    return this.walletRepository.findTransactionsByWallet(id);
  }

  /**
   * Écriture passée À LA MAIN au grand livre depuis le back-office.
   *
   * Elle acceptait n'importe quels `walletSourceId` / `walletDestinationId` —
   * aucune vérification d'existence, aucune vérification de nature. Un jeton
   * `platform:wallet` permettait donc d'inscrire au grand livre un mouvement
   * entre deux portefeuilles d'investisseurs, ou vers un identifiant qui
   * n'existe pas : la ligne apparaissait ensuite dans les relevés, les exports
   * comptables et le rapprochement, sans qu'aucun parcours métier ne l'ait
   * produite. Trois gardes désormais :
   *
   *  1. les portefeuilles cités EXISTENT (404 sinon) ;
   *  2. l'écriture touche au moins un portefeuille de la plateforme
   *     ({@link TYPES_WALLET_PLATEFORME}) — un virement entre deux
   *     investisseurs n'est pas une opération d'exploitation ;
   *  3. le rôle de l'appelant est RELU EN BASE, comme sur toute route qui
   *     touche à l'argent.
   *
   * Et l'opération laisse une entrée d'audit métier nominative.
   *
   * NOTE : cette écriture ne déplace aucun solde (statut INITIE). Elle
   * n'en est pas anodine pour autant — c'est le grand livre qui fait foi au
   * rapprochement.
   */
  @ApiOperation({ summary: 'Créer une écriture au grand livre (back-office)' })
  @ApiResponse({ status: 201, description: 'Transaction enregistrée' })
  @ApiResponse({ status: 400, description: 'Aucun portefeuille désigné' })
  @ApiResponse({ status: 403, description: 'Rôle non habilité, ou écriture entre deux portefeuilles personnels' })
  @ApiResponse({ status: 404, description: 'Portefeuille introuvable' })
  @Post('transactions')
  @RequirePermission('platform:wallet')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<Transaction> {
    const role = await this.assertPlatformWallet(user.userId);
    const { source, destination } = await this.assertOperationPlateforme(dto);

    const tx = new Transaction();
    tx.walletSource = dto.walletSourceId ?? null;
    tx.walletDestination = dto.walletDestinationId ?? null;
    tx.montant = dto.montant;
    tx.devise = 'EUR';
    tx.type = dto.type;
    tx.referenceExterne = null;
    tx.fournisseur = dto.fournisseur ?? TransactionFournisseur.STRIPE;
    tx.statut = TransactionStatus.INITIE;
    tx.investissementId = dto.investissementId ?? null;
    tx.echeanceId = null;
    tx.reservationId = null;
    tx.projetId = dto.projetId ?? null;
    tx.idempotencyKey = dto.idempotencyKey ?? null;
    tx.fraisPsp = 0;
    tx.fraisPlateforme = 0;
    tx.metadata = null;
    tx.motifEchec = null;
    const saved = await this.walletRepository.saveTransaction(tx);

    await this.auditLog.create(
      String(user.userId),
      role,
      'wallet.transaction.manuelle',
      'transaction',
      String(saved.id ?? ''),
      undefined,
      undefined,
      {
        montant: dto.montant,
        type: dto.type,
        walletSourceId: dto.walletSourceId ?? null,
        walletSourceType: source?.type ?? null,
        walletDestinationId: dto.walletDestinationId ?? null,
        walletDestinationType: destination?.type ?? null,
      },
    );

    return saved;
  }

  /**
   * Rôle RELU EN BASE : un jeton antérieur au retrait d'un rôle ne doit pas
   * pouvoir écrire au grand livre. Rend le rôle, dont l'entrée d'audit a
   * besoin.
   */
  private async assertPlatformWallet(userId: number): Promise<string> {
    const acteur = await this.userRepo.findOne({
      where: { userId },
      select: ['userId', 'role'],
    });
    if (!acteur || !hasPermission(acteur.role, 'platform:wallet')) {
      throw new ForbiddenException('Acces refuse.');
    }
    return acteur.role;
  }

  /**
   * Résout les deux extrémités de l'écriture et vérifie qu'elle relève bien de
   * l'exploitation de la plateforme.
   */
  private async assertOperationPlateforme(dto: CreateTransactionDto): Promise<{
    source: Wallet | null;
    destination: Wallet | null;
  }> {
    if (!dto.walletSourceId && !dto.walletDestinationId) {
      throw new BadRequestException(
        'Une écriture doit désigner au moins un portefeuille.',
      );
    }

    const [source, destination] = await Promise.all([
      dto.walletSourceId
        ? this.walletRepository.findWalletById(dto.walletSourceId)
        : Promise.resolve(null),
      dto.walletDestinationId
        ? this.walletRepository.findWalletById(dto.walletDestinationId)
        : Promise.resolve(null),
    ]);

    if (dto.walletSourceId && !source) {
      throw new NotFoundException('Portefeuille source introuvable.');
    }
    if (dto.walletDestinationId && !destination) {
      throw new NotFoundException('Portefeuille destinataire introuvable.');
    }

    const touchePlateforme = [source, destination].some(
      (w) => w !== null && TYPES_WALLET_PLATEFORME.includes(w.type),
    );
    if (!touchePlateforme) {
      throw new ForbiddenException(
        "Cette écriture ne touche aucun portefeuille de la plateforme : un " +
          "mouvement entre portefeuilles personnels relève des parcours métier " +
          '(souscription, cession, distribution), pas du back-office.',
      );
    }

    return { source, destination };
  }
}
