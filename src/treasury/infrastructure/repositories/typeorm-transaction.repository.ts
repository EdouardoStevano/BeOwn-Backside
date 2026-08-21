import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionRepository } from 'src/treasury/domain/repositories/transaction.repository';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { TransactionEntity } from '../persistence/entities/transaction.entity';
import { WalletOrmMapper } from '../persistence/mappers/wallet.orm-mapper';

@Injectable()
export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactions: Repository<TransactionEntity>,
  ) {}

  async enregistrer(transaction: Transaction): Promise<Transaction> {
    const saved = await this.transactions.save(
      WalletOrmMapper.txToEntity(transaction),
    );
    return WalletOrmMapper.txToDomain(saved);
  }

  async findByWallet(walletId: string): Promise<Transaction[]> {
    const entities = await this.transactions
      .createQueryBuilder('t')
      .where(
        't.walletSource = :id OR t.walletDestination = :id OR t.walletId = :id',
        { id: walletId },
      )
      .orderBy('t.createdAt', 'DESC')
      .getMany();
    return entities.map(WalletOrmMapper.txToDomain);
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const entity = await this.transactions.findOne({
      where: { idempotencyKey: key },
    });
    return entity ? WalletOrmMapper.txToDomain(entity) : null;
  }
}
