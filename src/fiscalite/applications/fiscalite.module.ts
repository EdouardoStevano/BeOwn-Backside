import { Module } from '@nestjs/common';
import { FiscaliteInfrastructureModule } from '../infrastructure/fiscalite-infrastructure.module';

@Module({
  imports: [FiscaliteInfrastructureModule],
  exports: [FiscaliteInfrastructureModule],
})
export class FiscaliteModule {}
