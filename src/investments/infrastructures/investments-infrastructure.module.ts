import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentEntity } from './persistences/entities/investment.entity';
import { EcheanceEntity } from './persistences/entities/echeance.entity';
import { InvestmentTypeOrmRepository } from './persistences/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../applications/ports/repositories/investment.repository';

@Module({
  imports: [TypeOrmModule.forFeature([InvestmentEntity, EcheanceEntity])],
  providers: [
    { provide: INVESTMENT_REPOSITORY, useClass: InvestmentTypeOrmRepository },
  ],
  exports: [INVESTMENT_REPOSITORY],
})
export class InvestmentsInfrastructureModule {}
