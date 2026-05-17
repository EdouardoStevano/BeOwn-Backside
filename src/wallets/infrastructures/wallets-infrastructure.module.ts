import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './persistences/entities/wallet.entity';
import { TransactionEntity } from './persistences/entities/transaction.entity';
import { WalletTypeOrmRepository } from './persistences/repositories/wallet.repository';
import { WALLET_REPOSITORY } from '../applications/ports/repositories/wallet.repository';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, TransactionEntity])],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: WalletTypeOrmRepository },
  ],
  exports: [WALLET_REPOSITORY],
})
export class WalletsInfrastructureModule {}
