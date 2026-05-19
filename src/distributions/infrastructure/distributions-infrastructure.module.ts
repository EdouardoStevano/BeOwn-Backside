import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodeDistributionEntity } from './persistences/entities/periode-distribution.entity';
import { PeriodeDistributionTypeOrmRepository } from './persistences/repositories/periode-distribution.repository';
import { PERIODE_DISTRIBUTION_REPOSITORY } from '../applications/ports/repositories/periode-distribution.repository';

@Module({
  imports: [TypeOrmModule.forFeature([PeriodeDistributionEntity])],
  providers: [
    {
      provide: PERIODE_DISTRIBUTION_REPOSITORY,
      useClass: PeriodeDistributionTypeOrmRepository,
    },
  ],
  exports: [PERIODE_DISTRIBUTION_REPOSITORY],
})
export class DistributionsInfrastructureModule {}
