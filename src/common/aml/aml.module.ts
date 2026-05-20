import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlMonitorService } from './aml-monitor.service';
import { AdminComplianceController } from './admin-compliance.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';

@Module({
  imports: [NotificationsModule, TypeOrmModule.forFeature([UserEntity])],
  controllers: [AdminComplianceController],
  providers: [AmlMonitorService],
  exports: [AmlMonitorService],
})
export class AmlModule {}
