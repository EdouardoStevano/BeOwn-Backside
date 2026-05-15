import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecondaryMarketInfrastructureModule } from '../infrastructure/secondary-market-infrastructure.module';
import { SecondaryMarketController } from '../presenters/http/secondary-market.controller';
import { YouSignWebhookController } from '../presenters/http/yousign-webhook.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { ContractGeneratorService } from 'src/investments/applications/usecases/contract-generator.service';
import { InitiateBuyUseCase } from './usecases/initiate-buy.usecase';
import { CancelInitiationUseCase } from './usecases/cancel-initiation.usecase';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';

@Module({
  imports: [
    SecondaryMarketInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
    CloudStorageModule,
    YouSignModule,
    TypeOrmModule.forFeature([ProjectEntity, UserEntity, InvestmentEntity]),
  ],
  providers: [
    ContractGeneratorService,
    InitiateBuyUseCase,
    CancelInitiationUseCase,
  ],
  controllers: [SecondaryMarketController, YouSignWebhookController],
})
export class SecondaryMarketModule {}
