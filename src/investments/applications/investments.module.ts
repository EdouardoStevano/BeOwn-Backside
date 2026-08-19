import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentsInfrastructureModule } from '../infrastructure/investments-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { CreateInvestmentUseCase } from './usecases/create-investment.usecase';
import { ContractGeneratorService } from './usecases/contract-generator.service';
import { TopUpInvestmentUseCase } from './usecases/top-up-investment.usecase';
import { InitiateInvestmentUseCase } from './usecases/initiate-investment.usecase';
import { CancelInvestmentUseCase } from './usecases/cancel-investment.usecase';
import { InvestmentController } from '../presenters/http/investment.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { KycModule } from 'src/kyc/applications/kyc.module';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { EcheancesCronService } from './echeances-cron.service';
import { IfuGenerationService } from './ifu-generation.service';
import { PayEcheanceUseCase } from './usecases/pay-echeance.usecase';
import { ProjectScheduleGeneratorService } from './project-schedule-generator.service';
import { CollecteCloseCronService } from './collecte-close-cron.service';
import { RefundCollecteService } from './refund-collecte.service';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      InvestmentEntity,
      DocumentEntity,
      SignatureEntity,
      WalletEntity,
      UserEntity,
      UserEmailEntity,
      EcheanceEntity,
      TransactionEntity,
    ]),
    InvestmentsInfrastructureModule,
    IamInfrastructureModule,
    ProjectsInfrastructureModule,
    WalletsInfrastructureModule,
    DocumentsInfrastructureModule,
    UsersInfrastructureModule,
    ProfilesInfrastructureModule,
    CloudStorageModule,
    YouSignModule,
    NotificationsModule,
    // `KycValidatedGuard` : investir exige un dossier vérifié.
    KycModule,
  ],
  providers: [
    CreateInvestmentUseCase,
    ContractGeneratorService,
    TopUpInvestmentUseCase,
    InitiateInvestmentUseCase,
    CancelInvestmentUseCase,
    EcheancesCronService,
    IfuGenerationService,
    PayEcheanceUseCase,
    ProjectScheduleGeneratorService,
    CollecteCloseCronService,
    RefundCollecteService,
  ],
  controllers: [InvestmentController],
  exports: [
    PayEcheanceUseCase,
    IfuGenerationService,
    ProjectScheduleGeneratorService,
    RefundCollecteService,
  ],
})
export class InvestmentsModule {}
