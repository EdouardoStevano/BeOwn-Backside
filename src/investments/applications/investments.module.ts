import { Module } from '@nestjs/common';
import { InvestmentsInfrastructureModule } from '../infrastructure/investments-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';
import { CreateInvestmentUseCase } from './usecases/create-investment.usecase';
import { ContractGeneratorService } from './usecases/contract-generator.service';
import { InvestmentController } from '../presenters/http/investment.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    InvestmentsInfrastructureModule,
    IamInfrastructureModule,
    ProjectsInfrastructureModule,
    WalletsInfrastructureModule,
    DocumentsInfrastructureModule,
    UsersInfrastructureModule,
    CloudStorageModule,
  ],
  providers: [CreateInvestmentUseCase, ContractGeneratorService],
  controllers: [InvestmentController],
  exports: [],
})
export class InvestmentsModule {}
