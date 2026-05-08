import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
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
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { Wallet } from 'src/wallets/domains/wallet';
import { Transaction } from 'src/wallets/domains/transaction';
import {
  TransactionFournisseur,
  TransactionStatus,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { CreateTransactionDto, CreateWalletDto } from '../dto/wallet.dto';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@ApiTags('Wallets & Transactions')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  @ApiOperation({ summary: 'Créer un wallet' })
  @ApiResponse({ status: 201, description: 'Wallet créé' })
  @Post()
  async createWallet(@Body() dto: CreateWalletDto): Promise<Wallet> {
    const wallet = new Wallet();
    wallet.type = dto.type;
    wallet.proprietaireUserId = null;
    wallet.projetId = null;
    wallet.spvId = null;
    wallet.fournisseurRef = dto.fournisseurRef;
    wallet.devise = dto.devise ?? 'XOF';
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
  ): Promise<Wallet> {
    let wallet = await this.walletRepository.findWalletByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (!wallet) {
      const newWallet = new Wallet();
      newWallet.type = WalletType.INVESTISSEUR;
      newWallet.proprietaireUserId = userId;
      newWallet.projetId = null;
      newWallet.spvId = null;
      newWallet.fournisseurRef = `INV-${userId}-auto`;
      newWallet.devise = 'XOF';
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
  async findOne(@Param('id') id: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findWalletById(id);
    if (!wallet) throw new NotFoundException('Wallet introuvable.');
    return wallet;
  }

  @ApiOperation({ summary: "Transactions d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Liste des transactions' })
  @Get(':id/transactions')
  getTransactions(@Param('id') id: string): Promise<Transaction[]> {
    return this.walletRepository.findTransactionsByWallet(id);
  }

  @ApiOperation({ summary: 'Créer une transaction' })
  @ApiResponse({ status: 201, description: 'Transaction enregistrée' })
  @Post('transactions')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
  ): Promise<Transaction> {
    const tx = new Transaction();
    tx.walletSource = dto.walletSourceId ?? null;
    tx.walletDestination = dto.walletDestinationId ?? null;
    tx.montant = dto.montant;
    tx.devise = 'XOF';
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
    return this.walletRepository.saveTransaction(tx);
  }
}
