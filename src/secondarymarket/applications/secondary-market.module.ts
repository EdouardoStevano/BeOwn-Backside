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
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycEntity]),
    SecondaryMarketInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
    CloudStorageModule,
    YouSignModule,
  ],
  providers: [
    ContractGeneratorService,
    InitiateBuyUseCase,
    CancelInitiationUseCase,
    KycValidatedGuard,
  ],
  controllers: [SecondaryMarketController, YouSignWebhookController],
})
export class SecondaryMarketModule {}
