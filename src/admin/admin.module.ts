import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminSecondaryMarketController } from './admin-secondary-market.controller';
import { AdminProjectActionsController } from './admin-project-actions.controller';
import { AdminReservationsController } from './admin-reservations.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminEcheancesController } from './admin-echeances.controller';
import { AdminRetraitsController } from './admin-retraits.controller';
import { AdminFiscalController } from './admin-fiscal.controller';
import { AdminInvestorsController } from './admin-investors.controller';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ReservationEntity } from 'src/reservations/infrastructure/persistences/entities/reservation.entity';
import { AdminSettingsEntity } from './entities/admin-settings.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { InvestmentsModule } from 'src/investments/applications/investments.module';
import { ProfilesModule } from 'src/profiles/applications/profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProjectEntity,
      InvestmentEntity,
      EcheanceEntity,
      KycEntity,
      OrdreMarcheEntity,
      WalletEntity,
      TransactionEntity,
      ReservationEntity,
      AdminSettingsEntity,
    ]),
    IamInfrastructureModule,
    NotificationsModule,
    InvestmentsModule,
    ProfilesModule,
  ],
  controllers: [
    AdminController,
    AdminSecondaryMarketController,
    AdminProjectActionsController,
    AdminReservationsController,
    AdminSettingsController,
    AdminReportsController,
    AdminEcheancesController,
    AdminRetraitsController,
    AdminInvestorsController,
  ],
})
export class AdminModule {}
