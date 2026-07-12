import { Module } from '@nestjs/common';
import { AvisInfrastructureModule } from '../infrastructure/avis-infrastructure.module';
import { AvisController } from '../presenters/http/avis.controller';

@Module({
  imports: [AvisInfrastructureModule],
  controllers: [AvisController],
})
export class AvisModule {}
