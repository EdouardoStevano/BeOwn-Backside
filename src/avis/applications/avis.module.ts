import { Module } from '@nestjs/common';
import { AvisInfrastructureModule } from '../infrastructure/avis-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { AvisController } from '../presenters/http/avis.controller';

@Module({
  imports: [AvisInfrastructureModule, IamInfrastructureModule],
  controllers: [AvisController],
})
export class AvisModule {}
