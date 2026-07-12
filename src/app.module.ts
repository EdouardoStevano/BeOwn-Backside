import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DomainExceptionFilter } from './common/presenters/domain-exception.filter';
import { HashingModule } from './common/hashing/hashing.module';
import { EmailModule } from './common/email/email.module';
import { SmsModule } from './common/sms/sms.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { UsersModule } from './users/applications/users.module';
import { HealthController } from './health/health.controller';
import { IamModule } from './iam/iam.module';
import { IamInfrastructureModule } from './iam/infrastructure/iam-infrastructure.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { ProfilesModule } from './profiles/applications/profiles.module';
import { ProjectsModule } from './projects/applications/projects.module';
import { ReservationsModule } from './reservations/applications/reservations.module';
import { InvestmentsModule } from './investments/applications/investments.module';
import { WalletsModule } from './wallets/applications/wallets.module';
import { PaymentsModule } from './payments/payments.module';
import { SecondaryMarketModule } from './secondarymarket/applications/secondary-market.module';
import { NotificationsModule } from './notifications/notifications.module';
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
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';
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
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          host: process.env.MAIL_HOST || 'smtp.gmail.com',
          port: Number(process.env.MAIL_PORT) || 587,
          secure: false,
          auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_USER_PASSWORD,
          },
        },
        defaults: {
          from: `"BeOwn" <${process.env.MAIL_FROM}>`,
        },
        template: {
          dir: join(process.cwd(), 'src', 'common', 'email', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
    // Modules globaux : un seul binding pour chaque port partagé, au lieu d'un
    // re-binding dans chaque module qui en avait besoin.
    HashingModule,
    EmailModule,
    SmsModule,
    IamInfrastructureModule,
    UsersModule,
    IamModule,
    ProfilesModule,
    ProjectsModule,
    ReservationsModule,
    InvestmentsModule,
    WalletsModule,
    PaymentsModule,
    SecondaryMarketModule,
    NotificationsModule,
    DocumentsModule,
    AvisModule,
    NewsModule,
    KpiModule,
    AdminModule,
    CgpModule,
    LocativeManagementModule,
    DistributionsModule,
    FiscaliteModule,
    AmlModule,
    ...(process.env.NODE_ENV !== 'production' ? [NotificationTestModule] : []),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Traduit les erreurs métier en réponses HTTP. `@Catch(DomainError)` : les
    // HttpException des modules non encore migrés restent gérées par Nest.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
