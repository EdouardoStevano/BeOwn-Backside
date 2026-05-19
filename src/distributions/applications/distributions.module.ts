import { Module } from '@nestjs/common';
import { DistributionsInfrastructureModule } from '../infrastructure/distributions-infrastructure.module';

@Module({
  imports: [DistributionsInfrastructureModule],
  exports: [DistributionsInfrastructureModule],
})
export class DistributionsModule {}
