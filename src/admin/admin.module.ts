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
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { KycEntity } from 'src/compliance/infrastructure/persistence/entities/kyc.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ReservationEntity } from 'src/reservation/infrastructure/persistence/entities/reservation.entity';
import { AdminSettingsEntity } from './entities/admin-settings.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SubscriptionModule } from 'src/subscription/subscription.module';
import { ProfilesModule } from 'src/compliance/application/profiles.module';
import { UsersModule } from 'src/iam/application/users.module';
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
    SubscriptionModule,
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
