import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WALLET_REPOSITORY } from 'src/treasury/domain/repositories/wallet.repository';
import type { WalletRepository } from 'src/treasury/domain/repositories/wallet.repository';
import { TRANSACTION_REPOSITORY } from 'src/treasury/domain/repositories/transaction.repository';
import type { TransactionRepository } from 'src/treasury/domain/repositories/transaction.repository';
import type {
  Wallet,
  WalletSnapshot,
} from 'src/treasury/domain/aggregates/wallet';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { WalletFactory } from 'src/treasury/domain/factories/wallet.factory';
import {
  AccesWalletRefuseError,
  WalletIntrouvableError,
} from 'src/treasury/domain/errors/treasury.errors';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { hasPermission } from 'src/iam/domain/policies/role-permissions.policy';
import {
  TransactionFournisseur,
  TransactionStatus,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { CreateTransactionDto, CreateWalletDto } from './dto/wallet.dto';

/**
 * Routes de la trésorerie. Le contrôleur ne compose que des lectures et des
 * ouvertures de portefeuille, et rend des snapshots — mêmes clés JSON que
 * l'ancien modèle anémique qu'il sérialisait tel quel. Les erreurs métier
 * remontent telles quelles : `TreasuryErrorFilter` les traduit (§21).
 *
 * L'ouverture d'un portefeuille passe par {@link WalletFactory} : les deux
 * blocs de dix affectations de champs qui vivaient ici — dont un
 * `statut = 'actif'` en chaîne littérale — sont partis dans le domaine.
 *
 * Le RBAC (`RequirePermission`, `hasPermission`) reste ici : c'est de la
 * composition d'accès, pas une règle du domaine (§3.3).
 */
@ApiTags('Wallets & Transactions')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: TransactionRepository,
  ) {}

  private canManageWallets(user: ActiveUser): boolean {
    return hasPermission(user.role, 'platform:wallet');
  }

  private assertCanReadWallet(user: ActiveUser, wallet: Wallet): void {
    if (wallet.appartientA(user.userId)) return;
    if (this.canManageWallets(user)) return;
    throw new AccesWalletRefuseError();
  }

  @ApiOperation({ summary: 'Créer un wallet de plateforme' })
  @ApiResponse({ status: 201, description: 'Wallet créé' })
  @Post()
  @RequirePermission('platform:wallet')
  async createWallet(@Body() dto: CreateWalletDto): Promise<WalletSnapshot> {
    // Cette route n'a jamais ouvert que des portefeuilles sans titulaire : la
    // Factory le dit désormais explicitement, et refuse un type `investisseur`
    // qui produirait un solde que personne ne peut réclamer.
    const wallet = await this.wallets.creer(
      WalletFactory.ouvrirPourPlateforme(
        dto.type,
        dto.fournisseurRef,
        dto.devise,
      ),
    );
    return wallet.snapshot();
  }

  @ApiOperation({ summary: "Wallet d'un utilisateur" })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Wallet trouvé' })
  @ApiResponse({ status: 404, description: 'Wallet introuvable' })
  @Get('user/:userId')
  async getUserWallet(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: ActiveUser,
  ): Promise<WalletSnapshot> {
    if (user.userId !== userId && !this.canManageWallets(user)) {
      throw new AccesWalletRefuseError();
    }

    const existant = await this.wallets.findByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (existant) return existant.snapshot();

    // Un investisseur qui consulte son portefeuille pour la première fois se le
    // voit ouvrir ; un tiers, même habilité, ne provoque pas cette ouverture.
    if (user.userId !== userId) {
      throw new WalletIntrouvableError();
    }
    const ouvert = await this.wallets.creer(
      WalletFactory.ouvrirPourInvestisseur(userId),
    );
    return ouvert.snapshot();
  }

  @ApiOperation({ summary: "Détail d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Wallet trouvé' })
  @ApiResponse({ status: 404, description: 'Wallet introuvable' })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<WalletSnapshot> {
    const wallet = await this.wallets.findById(id);
    if (!wallet) throw new WalletIntrouvableError(id);
    this.assertCanReadWallet(user, wallet);
    return wallet.snapshot();
  }

  @ApiOperation({ summary: "Transactions d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Liste des transactions' })
  @Get(':id/transactions')
  async getTransactions(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<Transaction[]> {
    const wallet = await this.wallets.findById(id);
    if (!wallet) throw new WalletIntrouvableError(id);
    this.assertCanReadWallet(user, wallet);
    return this.transactions.findByWallet(id);
  }

  @ApiOperation({ summary: 'Créer une transaction' })
  @ApiResponse({ status: 201, description: 'Transaction enregistrée' })
  @Post('transactions')
  @RequirePermission('platform:wallet')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
  ): Promise<Transaction> {
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
    return this.transactions.enregistrer(tx);
  }
}
