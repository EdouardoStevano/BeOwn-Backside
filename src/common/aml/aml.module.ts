import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlMonitorService } from './aml-monitor.service';
import { AdminComplianceController } from './admin-compliance.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

@Module({
  imports: [
    NotificationsModule,
    IamInfrastructureModule,
    TypeOrmModule.forFeature([UserEntity]),
  ],
  controllers: [AdminComplianceController],
  providers: [AmlMonitorService],
  exports: [AmlMonitorService],
})
export class AmlModule {}
