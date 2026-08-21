import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentEntity } from './persistence/entities/investment.entity';
import { EcheanceEntity } from './persistence/entities/echeance.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { TypeOrmInvestmentRepository } from './repositories/typeorm-investment.repository';
import { INVESTMENT_REPOSITORY } from '../domain/repositories/investment.repository';

/**
 * Adapters de sortie du contexte Subscription. Importé par les contextes qui
 * lisent des investissements — Catalog (fiche projet), Distributions,
 * Fiscalité… — qui dépendent du port, jamais de la classe TypeORM (§33).
 */
@Module({
  imports: [TypeOrmModule.forFeature([InvestmentEntity, EcheanceEntity, SignatureEntity])],
  providers: [
    { provide: INVESTMENT_REPOSITORY, useClass: TypeOrmInvestmentRepository },
  ],
  exports: [INVESTMENT_REPOSITORY],
})
export class SubscriptionInfrastructureModule {}
