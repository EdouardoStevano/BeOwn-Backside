import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationEntity } from './infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from './infrastructure/persistences/entities/audit-log.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { NotificationService } from './applications/notification.service';
import { NotificationEventService } from './applications/notification-event.service';
import { NotificationController } from './presenters/http/notification.controller';
import { AuditLogService } from './applications/audit-log.service';
import { AuditLogController } from './presenters/http/audit-log.controller';
import { NotificationGateway } from './presenters/ws/notification.gateway';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity, AuditLogEntity, UserEntity]),
    IamInfrastructureModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationService, NotificationEventService, AuditLogService, NotificationGateway],
  controllers: [NotificationController, AuditLogController],
  exports: [NotificationService, NotificationEventService, AuditLogService, NotificationGateway, TypeOrmModule],
})
export class NotificationsModule {}
