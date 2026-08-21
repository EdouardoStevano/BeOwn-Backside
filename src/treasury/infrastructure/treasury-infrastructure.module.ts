import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './persistence/entities/wallet.entity';
import { TransactionEntity } from './persistence/entities/transaction.entity';
import { TypeOrmWalletRepository } from './repositories/typeorm-wallet.repository';
import { TypeOrmTransactionRepository } from './repositories/typeorm-transaction.repository';
import { WALLET_REPOSITORY } from '../domain/repositories/wallet.repository';
import { TRANSACTION_REPOSITORY } from '../domain/repositories/transaction.repository';

/**
 * Les adapters de sortie du contexte : deux collections, deux agrégats (§10).
 * Exportés séparément pour que les contextes en aval ne se voient offrir que
 * ce qu'ils lisent — `subscription` interroge le registre des mouvements pour
 * son idempotence, `iam` ne lit que le portefeuille.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, TransactionEntity])],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: TypeOrmWalletRepository },
    { provide: TRANSACTION_REPOSITORY, useClass: TypeOrmTransactionRepository },
  ],
  exports: [WALLET_REPOSITORY, TRANSACTION_REPOSITORY],
})
export class TreasuryInfrastructureModule {}
