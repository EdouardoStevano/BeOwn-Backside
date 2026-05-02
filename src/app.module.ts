import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/applications/users.module';
import { IamModule } from './iam/iam.module';
import { ProfilesModule } from './profiles/applications/profiles.module';
import { ProjectsModule } from './projects/applications/projects.module';
import { ReservationsModule } from './reservations/applications/reservations.module';
import { InvestmentsModule } from './investments/applications/investments.module';
import { WalletsModule } from './wallets/applications/wallets.module';
import { PaymentsModule } from './payments/payments.module';
import { SecondaryMarketModule } from './secondary-market/applications/secondary-market.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    }),

    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
      username: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'pass123',
      database: process.env.DATABASE_DB || 'postgres',
      autoLoadEntities: true,
      synchronize: true,
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
          from: `"Beown" <${process.env.MAIL_FROM}>`,
        },
      }),
    }),
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
  ],
})
export class AppModule {}
