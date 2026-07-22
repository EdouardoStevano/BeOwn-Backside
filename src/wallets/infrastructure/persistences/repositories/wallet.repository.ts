import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { Wallet } from 'src/wallets/domains/wallet';
import { Transaction } from 'src/wallets/domains/transaction';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { WalletEntity } from '../entities/wallet.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { WalletMapper } from '../mappers/wallet.mapper';

@Injectable()
export class WalletTypeOrmRepository implements WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async saveWallet(wallet: Wallet): Promise<Wallet> {
    const entity = WalletMapper.walletToEntity(wallet);
    const saved = await this.walletRepo.save(entity);
    return WalletMapper.walletToDomain(saved);
  }

  async findWalletById(id: string): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({ where: { id } });
    return entity ? WalletMapper.walletToDomain(entity) : null;
  }

  async findWalletByUser(
    userId: number,
    type?: WalletType,
  ): Promise<Wallet | null> {
    const where: any = { proprietaireUserId: userId };
    if (type) where.type = type;
    const entity = await this.walletRepo.findOne({ where });
    return entity ? WalletMapper.walletToDomain(entity) : null;
  }

  async findWalletByProject(
    projetId: string,
    type: WalletType,
  ): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({
      where: { projetId, type },
    });
    return entity ? WalletMapper.walletToDomain(entity) : null;
  }

  async updateSolde(walletId: string, delta: number): Promise<Wallet> {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error('Wallet balance delta must be a finite non-zero number.');
    }
    await this.walletRepo
      .createQueryBuilder()
      .update()
      .set({ solde: () => 'solde + :delta' })
      .where('id = :id', { id: walletId })
      .andWhere('solde + :delta >= 0')
      .setParameters({ delta })
      .execute();
    const updated = await this.walletRepo.findOneOrFail({
      where: { id: walletId },
    });
    return WalletMapper.walletToDomain(updated);
  }

  async saveTransaction(tx: Transaction): Promise<Transaction> {
    const entity = WalletMapper.txToEntity(tx);
    const saved = await this.txRepo.save(entity);
    return WalletMapper.txToDomain(saved);
  }

  async findTransactionsByWallet(walletId: string): Promise<Transaction[]> {
    const entities = await this.txRepo
      .createQueryBuilder('t')
      .where(
        't.walletSource = :id OR t.walletDestination = :id OR t.walletId = :id',
        { id: walletId },
      )
      .orderBy('t.createdAt', 'DESC')
      .getMany();
    return entities.map(WalletMapper.txToDomain);
  }

  async findTransactionByIdempotencyKey(
    key: string,
  ): Promise<Transaction | null> {
    const entity = await this.txRepo.findOne({
      where: { idempotencyKey: key },
    });
    return entity ? WalletMapper.txToDomain(entity) : null;
  }
}
