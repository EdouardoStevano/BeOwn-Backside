import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletRepository } from 'src/treasury/domain/repositories/wallet.repository';
import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import { WalletEntity } from '../persistence/entities/wallet.entity';
import { TransactionEntity } from '../persistence/entities/transaction.entity';
import { WalletOrmMapper } from '../persistence/mappers/wallet.orm-mapper';

@Injectable()
export class TypeOrmWalletRepository implements WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async saveWallet(wallet: Wallet): Promise<Wallet> {
    const entity = WalletOrmMapper.walletToEntity(wallet);
    const saved = await this.walletRepo.save(entity);
    return WalletOrmMapper.walletToDomain(saved);
  }

  async findWalletById(id: string): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({ where: { id } });
    return entity ? WalletOrmMapper.walletToDomain(entity) : null;
  }

  async findWalletByUser(
    userId: number,
    type?: WalletType,
  ): Promise<Wallet | null> {
    const where: any = { proprietaireUserId: userId };
    if (type) where.type = type;
    const entity = await this.walletRepo.findOne({ where });
    return entity ? WalletOrmMapper.walletToDomain(entity) : null;
  }

  async findWalletByProject(
    projetId: string,
    type: WalletType,
  ): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({
      where: { projetId, type },
    });
    return entity ? WalletOrmMapper.walletToDomain(entity) : null;
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
    return WalletOrmMapper.walletToDomain(updated);
  }

  async saveTransaction(tx: Transaction): Promise<Transaction> {
    const entity = WalletOrmMapper.txToEntity(tx);
    const saved = await this.txRepo.save(entity);
    return WalletOrmMapper.txToDomain(saved);
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
    return entities.map(WalletOrmMapper.txToDomain);
  }

  async findTransactionByIdempotencyKey(
    key: string,
  ): Promise<Transaction | null> {
    const entity = await this.txRepo.findOne({
      where: { idempotencyKey: key },
    });
    return entity ? WalletOrmMapper.txToDomain(entity) : null;
  }
}
