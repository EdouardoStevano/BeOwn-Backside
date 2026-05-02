import { Module } from '@nestjs/common';
import { WalletsInfrastructureModule } from '../infrastructures/wallets-infrastructure.module';
import { WalletController } from '../presenters/http/wallet.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { WALLET_REPOSITORY } from './ports/repositories/wallet.repository';

@Module({
  imports: [WalletsInfrastructureModule, IamInfrastructureModule],
  controllers: [WalletController],
  exports: [],
})
export class WalletsModule {}
