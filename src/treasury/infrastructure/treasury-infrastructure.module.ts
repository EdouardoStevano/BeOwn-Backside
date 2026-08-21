import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './persistence/entities/wallet.entity';
import { TransactionEntity } from './persistence/entities/transaction.entity';
import { TypeOrmWalletRepository } from './repositories/typeorm-wallet.repository';
import { WALLET_REPOSITORY } from '../domain/repositories/wallet.repository';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, TransactionEntity])],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: TypeOrmWalletRepository },
  ],
  exports: [WALLET_REPOSITORY],
})
export class TreasuryInfrastructureModule {}
