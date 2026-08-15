import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminSecondaryMarketController } from './admin-secondary-market.controller';
import { AdminProjectActionsController } from './admin-project-actions.controller';
import { AdminReservationsController } from './admin-reservations.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminEcheancesController, AdminEcheancesItemController } from './admin-echeances.controller';
import { AdminRetraitsController } from './admin-retraits.controller';
import { AdminInvestorsController } from './admin-investors.controller';
import { AdminPlatformWalletController } from './admin-platform-wallet.controller';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { EmailTemplateEntity } from 'src/shared/email/entities/email-template.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
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
import { UsersModule } from 'src/iam/applications/users.module';
import { TriggerEcheancePaymentUseCase } from './usecases/trigger-echeance-payment.usecase';
import { GetAggregatedScheduleUseCase } from './usecases/get-aggregated-schedule.usecase';
import { PatchAggregatedEcheanceUseCase } from './usecases/patch-aggregated-echeance.usecase';

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
      EmailTemplateEntity,
    ]),
    IamInfrastructureModule,
    NotificationsModule,
    InvestmentsModule,
    ProfilesModule,
    UsersModule,
  ],
  controllers: [
    AdminController,
    AdminSecondaryMarketController,
    AdminProjectActionsController,
    AdminReservationsController,
    AdminSettingsController,
    AdminReportsController,
    AdminEcheancesController,
    AdminEcheancesItemController,
    AdminRetraitsController,
    AdminInvestorsController,
    AdminPlatformWalletController,
    AdminEmailTemplatesController,
  ],
  providers: [
    TriggerEcheancePaymentUseCase,
    GetAggregatedScheduleUseCase,
    PatchAggregatedEcheanceUseCase,
  ],
})
export class AdminModule {}
