import { Module } from '@nestjs/common';
import { InvestmentsInfrastructureModule } from '../infrastructures/investments-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructures/projects-infrastructure.module';
import { CreateInvestmentUseCase } from './usecases/create-investment.usecase';
import { InvestmentController } from '../presenters/http/investment.controller';
import { INVESTMENT_REPOSITORY } from './ports/repositories/investment.repository';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    InvestmentsInfrastructureModule,
    IamInfrastructureModule,
    ProjectsInfrastructureModule,
  ],
  providers: [CreateInvestmentUseCase],
  controllers: [InvestmentController],
  exports: [],
})
export class InvestmentsModule {}
