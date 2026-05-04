import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from './infrastructure/persistences/entities/audit-log.entity';
import { NotificationService } from './applications/notification.service';
import { NotificationController } from './presenters/http/notification.controller';
import { AuditLogService } from './applications/audit-log.service';
import { AuditLogController } from './presenters/http/audit-log.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity, AuditLogEntity]),
    IamInfrastructureModule,
  ],
  providers: [NotificationService, AuditLogService],
  controllers: [NotificationController, AuditLogController],
  exports: [NotificationService, AuditLogService, TypeOrmModule],
})
export class NotificationsModule {}
