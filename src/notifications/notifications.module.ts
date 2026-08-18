import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationEntity } from './infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from './infrastructure/persistences/entities/audit-log.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserPreferencesEntity } from 'src/preferences/infrastructure/persistences/entities/user-preferences.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { NotificationService } from './applications/notification.service';
import { NotificationEventService } from './applications/notification-event.service';
import { NotificationController } from './presenters/http/notification.controller';
import { AuditLogService } from './applications/audit-log.service';
import { AuditLogController } from './presenters/http/audit-log.controller';
import { NotificationGateway } from './presenters/ws/notification.gateway';
import { NotificationUnsubscribeService } from './applications/notification-unsubscribe.service';
import { BroadcastService } from './applications/broadcast.service';
import { PublicUnsubscribeController } from './presenters/http/public-unsubscribe.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { PreferencesModule } from 'src/preferences/applications/preferences.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      AuditLogEntity,
      UserEntity,
      // Lecture seule pour BroadcastService : destinataires (préférences,
      // téléphone), projet diffusé (horodatage anti-doublon) et toggles admin.
      UserPreferencesEntity,
      ProjectEntity,
      AdminSettingsEntity,
    ]),
    IamInfrastructureModule,
    UsersInfrastructureModule,
    // `NotificationUnsubscribeService` règle une préférence : il passe par le
    // use case du contexte Preferences, plus par le port du compte.
    PreferencesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    NotificationService,
    NotificationEventService,
    AuditLogService,
    NotificationGateway,
    NotificationUnsubscribeService,
    BroadcastService,
    // que AdminModule/AuthenticationModule.
  ],
  controllers: [
    NotificationController,
    AuditLogController,
    PublicUnsubscribeController,
  ],
  exports: [
    NotificationService,
    NotificationEventService,
    AuditLogService,
    NotificationGateway,
    NotificationUnsubscribeService,
    BroadcastService,
    TypeOrmModule,
  ],
})
export class NotificationsModule {}
