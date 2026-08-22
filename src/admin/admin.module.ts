import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminSecondaryMarketController } from './admin-secondary-market.controller';
import { AdminProjectActionsController } from './admin-project-actions.controller';
import { AdminReservationsController } from './admin-reservations.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminRetraitsController } from './admin-retraits.controller';
import { AdminInvestorsController } from './admin-investors.controller';
import { AdminPlatformWalletController } from './admin-platform-wallet.controller';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { EmailTemplateEntity } from 'src/shared/email/entities/email-template.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { KycEntity } from 'src/compliance/infrastructure/persistence/entities/kyc.entity';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { ReservationEntity } from 'src/reservation/infrastructure/persistence/entities/reservation.entity';
import { AdminSettingsEntity } from './entities/admin-settings.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SubscriptionModule } from 'src/subscription/subscription.module';
import { ServicingModule } from 'src/servicing/servicing.module';
import { RegulatoryReportingModule } from 'src/regulatory-reporting/regulatory-reporting.module';
import { ProfilesModule } from 'src/compliance/application/profiles.module';
import { UsersModule } from 'src/iam/application/users.module';

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
      ReservationEntity,
      AdminSettingsEntity,
      EmailTemplateEntity,
    ]),
    IamInfrastructureModule,
    NotificationsModule,
    SubscriptionModule,
    // L'échéancier — y compris ses écrans d'administration — appartient à
    // `servicing`, qui les publie désormais lui-même (§3.3).
    ServicingModule,
    // `IfuGenerationService` : la génération des IFU que l'écran fiscal
    // déclenche appartient à `regulatory-reporting`.
    RegulatoryReportingModule,
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
    AdminRetraitsController,
    AdminInvestorsController,
    AdminPlatformWalletController,
    AdminEmailTemplatesController,
  ],
  providers: [],
})
export class AdminModule {}
