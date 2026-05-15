import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentsInfrastructureModule } from '../infrastructure/investments-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { CreateInvestmentUseCase } from './usecases/create-investment.usecase';
import { ContractGeneratorService } from './usecases/contract-generator.service';
import { TopUpInvestmentUseCase } from './usecases/top-up-investment.usecase';
import { InitiateInvestmentUseCase } from './usecases/initiate-investment.usecase';
import { InvestmentController } from '../presenters/http/investment.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UserEmailEntity } from 'src/users/infrastructure/persistences/entities/user-email.entity';

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
    ]),
    InvestmentsInfrastructureModule,
    IamInfrastructureModule,
    ProjectsInfrastructureModule,
    WalletsInfrastructureModule,
    DocumentsInfrastructureModule,
    UsersInfrastructureModule,
    CloudStorageModule,
    YouSignModule,
    NotificationsModule,
  ],
  providers: [CreateInvestmentUseCase, ContractGeneratorService, TopUpInvestmentUseCase, InitiateInvestmentUseCase],
  controllers: [InvestmentController],
  exports: [],
})
export class InvestmentsModule {}
