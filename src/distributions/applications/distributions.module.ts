import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionsInfrastructureModule } from '../infrastructure/distributions-infrastructure.module';
import { LocativeManagementInfrastructureModule } from 'src/locative-management/infrastructure/locative-management-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { CalculateDistributionPeriodeUseCase } from './usecases/calculate-distribution-periode.usecase';
import { ValidatePeriodeDistributionUseCase } from './usecases/validate-periode-distribution.usecase';
import { ExecuteDistributionUseCase } from './usecases/execute-distribution.usecase';
import { GetInvestisseurDistributionHistoryUseCase } from './usecases/get-investisseur-distribution-history.usecase';
import { DistributionsCronService } from './distributions-cron.service';
import { AdminDistributionsController } from '../presenters/http/admin-distributions.controller';
import { InvestisseurDistributionsController } from '../presenters/http/investisseur-distributions.controller';

@Module({
  imports: [
    DistributionsInfrastructureModule,
    LocativeManagementInfrastructureModule,
    ProjectsInfrastructureModule,
    InvestmentsInfrastructureModule,
    NotificationsModule,
    AmlModule,
    IamInfrastructureModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity]),
  ],
  controllers: [
    AdminDistributionsController,
    InvestisseurDistributionsController,
  ],
  providers: [
    CalculateDistributionPeriodeUseCase,
    ValidatePeriodeDistributionUseCase,
    ExecuteDistributionUseCase,
    GetInvestisseurDistributionHistoryUseCase,
    DistributionsCronService,
  ],
  exports: [
    DistributionsInfrastructureModule,
    CalculateDistributionPeriodeUseCase,
    ValidatePeriodeDistributionUseCase,
    ExecuteDistributionUseCase,
    GetInvestisseurDistributionHistoryUseCase,
    DistributionsCronService,
  ],
})
export class DistributionsModule {}
