import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthController } from './health/health.controller';
import { IamModule } from './iam/iam.module';
import { AccountOverviewModule } from './account-overview/account-overview.module';
import { IamInfrastructureModule } from './iam/infrastructure/iam-infrastructure.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AccountStatusGuard } from './common/auth/account-status.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { ProfilesModule } from './profiles/applications/profiles.module';
import { KycModule } from './kyc/applications/kyc.module';
import { ProjectsModule } from './projects/applications/projects.module';
import { ReservationsModule } from './reservations/applications/reservations.module';
import { InvestmentsModule } from './investments/applications/investments.module';
import { WalletsModule } from './wallets/applications/wallets.module';
import { PaymentsModule } from './payments/payments.module';
import { SecondaryMarketModule } from './secondarymarket/applications/secondary-market.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PreferencesModule } from 'src/preferences/applications/preferences.module';
import { DocumentsModule } from './documents/applications/documents.module';
import { NotificationTestModule } from './common/test/notification-test.module';
import { AdminModule } from './admin/admin.module';
import { CgpModule } from './cgp/cgp.module';
import { AvisModule } from './avis/applications/avis.module';
import { NewsModule } from './news/news.module';
import { KpiModule } from './kpi/kpi.module';
import { LocativeManagementModule } from './locative-management/applications/locative-management.module';
import { DistributionsModule } from './distributions/applications/distributions.module';
import { FiscaliteModule } from './fiscalite/applications/fiscalite.module';
import { AmlModule } from './common/aml/aml.module';
import { PlatformFeesModule } from './common/platform-fees/platform-fees.module';
import { PlatformSettingsModule } from './common/platform-settings/platform-settings.module';
import { ContactModule } from './common/contact/contact.module';
import { SmsModule } from './shared/sms/sms.module';
import { EmailModule } from './shared/email/email.module';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';

function requireEnv(name: string): string {
  throw new Error(`Required environment variable ${name} is not set.`);
}

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 500 },
      { name: 'medium', ttl: 60_000, limit: 2000 },
      { name: 'auth', ttl: 900_000, limit: 500 },
    ]),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
      username:
        process.env.DATABASE_USERNAME ?? requireEnv('DATABASE_USERNAME'),
      password:
        process.env.DATABASE_PASSWORD ?? requireEnv('DATABASE_PASSWORD'),
      database: process.env.DATABASE_DB ?? requireEnv('DATABASE_DB'),
      autoLoadEntities: true,
      // Schema changes are applied only by reviewed migrations.
      synchronize: false,
    }),
    // Plus de MailerModule/SMTP : l'email passe par EMAIL_SERVICE, fourni
    // globalement par EmailModule (Mailpit en dev, Brevo en prod).
    // Feeds AccountStatusGuard: lean per-request lookup of the user status,
    // independent of UsersModule's exports (see account-status.guard.ts).
    TypeOrmModule.forFeature([UserEntity]),
    SmsModule,
    EmailModule,
    IamInfrastructureModule,
    // UsersModule n'est plus monté ici : le compte utilisateur est devenu une
    // feature d'IAM, agrégée par IamModule au même titre qu'Authentication.
    IamModule,
    ProfilesModule,
    KycModule,
    ProjectsModule,
    ReservationsModule,
    InvestmentsModule,
    WalletsModule,
    PaymentsModule,
    SecondaryMarketModule,
    NotificationsModule,
    PreferencesModule,
    DocumentsModule,
    // Module de composition, monté après les contextes qu'il assemble (IAM,
    // Profiles, Preferences, Documents, Wallets) : il en dépend tous, et aucun
    // ne dépend de lui. Sert `GET /users/me` et `GET /users/:id`.
    AccountOverviewModule,
    AvisModule,
    NewsModule,
    KpiModule,
    AdminModule,
    CgpModule,
    LocativeManagementModule,
    DistributionsModule,
    FiscaliteModule,
    AmlModule,
    PlatformFeesModule,
    PlatformSettingsModule,
    ContactModule,
    ...(process.env.ENABLE_TEST_ENDPOINTS === 'true'
      ? [NotificationTestModule]
      : []),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountStatusGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
