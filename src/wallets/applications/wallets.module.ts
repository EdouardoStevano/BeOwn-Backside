import { Module } from '@nestjs/common';
import { WalletsInfrastructureModule } from '../infrastructure/wallets-infrastructure.module';
import { WalletController } from '../presenters/http/wallet.controller';
import { WALLET_REPOSITORY } from './ports/repositories/wallet.repository';

@Module({
  imports: [WalletsInfrastructureModule],
  controllers: [WalletController],
  exports: [],
})
export class WalletsModule {}
