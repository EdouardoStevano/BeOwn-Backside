import { Module } from '@nestjs/common';
import { LocativeManagementInfrastructureModule } from '../infrastructure/locative-management-infrastructure.module';

@Module({
  imports: [LocativeManagementInfrastructureModule],
  providers: [],
  exports: [LocativeManagementInfrastructureModule],
})
export class LocativeManagementModule {}
