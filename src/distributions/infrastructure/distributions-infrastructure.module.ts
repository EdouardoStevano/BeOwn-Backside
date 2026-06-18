import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodeDistributionEntity } from './persistences/entities/periode-distribution.entity';
import { DistributionPartEntity } from './persistences/entities/distribution-part.entity';
import { PeriodeDistributionTypeOrmRepository } from './persistences/repositories/periode-distribution.repository';
import { DistributionPartTypeOrmRepository } from './persistences/repositories/distribution-part.repository';
import { PERIODE_DISTRIBUTION_REPOSITORY } from '../applications/ports/repositories/periode-distribution.repository';
import { DISTRIBUTION_PART_REPOSITORY } from '../applications/ports/repositories/distribution-part.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PeriodeDistributionEntity,
      DistributionPartEntity,
    ]),
  ],
  providers: [
    {
      provide: PERIODE_DISTRIBUTION_REPOSITORY,
      useClass: PeriodeDistributionTypeOrmRepository,
    },
    {
      provide: DISTRIBUTION_PART_REPOSITORY,
      useClass: DistributionPartTypeOrmRepository,
    },
  ],
  exports: [PERIODE_DISTRIBUTION_REPOSITORY, DISTRIBUTION_PART_REPOSITORY],
})
export class DistributionsInfrastructureModule {}
