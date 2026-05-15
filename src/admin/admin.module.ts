import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminSecondaryMarketController } from './admin-secondary-market.controller';
import { AdminEcheancesController } from './admin-echeances.controller';
import { AdminRetraitsController } from './admin-retraits.controller';
import { AdminFiscalController } from './admin-fiscal.controller';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { InvestmentsModule } from 'src/investments/applications/investments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProjectEntity,
      InvestmentEntity,
      KycEntity,
      OrdreMarcheEntity,
      WalletEntity,
      TransactionEntity,
    ]),
    IamInfrastructureModule,
    NotificationsModule,
    InvestmentsModule,
  ],
  controllers: [AdminController, AdminSecondaryMarketController, AdminEcheancesController, AdminRetraitsController],
})
export class AdminModule {}
