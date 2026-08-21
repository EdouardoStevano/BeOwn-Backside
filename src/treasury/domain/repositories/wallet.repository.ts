import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');

export interface WalletRepository {
  saveWallet(wallet: Wallet): Promise<Wallet>;
  findWalletById(id: string): Promise<Wallet | null>;
  findWalletByUser(userId: number, type?: WalletType): Promise<Wallet | null>;
  findWalletByProject(
    projetId: string,
    type: WalletType,
  ): Promise<Wallet | null>;
  updateSolde(walletId: string, delta: number): Promise<Wallet>;

  saveTransaction(tx: Transaction): Promise<Transaction>;
  findTransactionsByWallet(walletId: string): Promise<Transaction[]>;
  findTransactionByIdempotencyKey(key: string): Promise<Transaction | null>;
}
