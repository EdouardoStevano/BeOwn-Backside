import { Module } from '@nestjs/common';
import { InvestmentsInfrastructureModule } from '../infrastructure/investments-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { CreateInvestmentUseCase } from './usecases/create-investment.usecase';
import { InvestmentController } from '../presenters/http/investment.controller';
import { INVESTMENT_REPOSITORY } from './ports/repositories/investment.repository';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    InvestmentsInfrastructureModule,
    IamInfrastructureModule,
    ProjectsInfrastructureModule,
    WalletsInfrastructureModule,
  ],
  providers: [CreateInvestmentUseCase],
  controllers: [InvestmentController],
  exports: [],
})
export class InvestmentsModule {}
