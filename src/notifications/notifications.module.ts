import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationEntity } from './infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from './infrastructure/persistences/entities/audit-log.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UserPreferencesEntity } from 'src/users/infrastructure/persistences/entities/user-preferences.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
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
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';

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
      ProfilPPEntity,
      AdminSettingsEntity,
    ]),
    // Pas d'import d'IamInfrastructureModule : il est @Global, et l'importer
    // ici créerait un cycle (Notifications → IamInfrastructure → Users →
    // Notifications). TOKEN_SERVICE est résolu sans ça.
    UsersInfrastructureModule,
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
    // Plus de re-binding local d'EMAIL_SERVICE : le transport vient du
    // EmailModule global (cf. AppModule), seul binding du port.
  ],
  controllers: [NotificationController, AuditLogController, PublicUnsubscribeController],
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
