import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MetricsThrottlerGuard } from './common/throttler/metrics-throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthController } from './health/health.controller';
import { IamModule } from './iam/iam.module';
import { IamInfrastructureModule } from './iam/infrastructure/iam-infrastructure.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AccountStatusGuard } from './common/auth/account-status.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { ProfilesModule } from './profiles/applications/profiles.module';
import { ProjectsModule } from './projects/applications/projects.module';
import { ReservationsModule } from './reservations/applications/reservations.module';
import { InvestmentsModule } from './investments/applications/investments.module';
import { WalletsModule } from './wallets/applications/wallets.module';
import { ReconciliationModule } from './wallets/reconciliation.module';
import { ParrainageModule } from './parrainage/parrainage.module';
import { PaymentsModule } from './payments/payments.module';
import { SecondaryMarketModule } from './secondarymarket/applications/secondary-market.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DocumentsModule } from './documents/applications/documents.module';
import { NotificationTestModule } from './common/test/notification-test.module';
import { areTestEndpointsEnabled } from './common/test/test-endpoints.policy';
import { AdminModule } from './admin/admin.module';
import { CgpModule } from './cgp/cgp.module';
import { AvisModule } from './avis/applications/avis.module';
import { ReclamationsModule } from './reclamations/reclamations.module';
import { NewsModule } from './news/news.module';
import { KpiModule } from './kpi/kpi.module';
import { ExchangeRatesModule } from './shared/exchange-rates/exchange-rates.module';
import { LocativeManagementModule } from './locative-management/applications/locative-management.module';
import { DistributionsModule } from './distributions/applications/distributions.module';
import { FiscaliteModule } from './fiscalite/applications/fiscalite.module';
import { AmlModule } from './common/aml/aml.module';
import { RgpdModule } from './rgpd/rgpd.module';
import { PorteurAccessModule } from './porteur-access/porteur-access.module';
import { PlatformFeesModule } from './common/platform-fees/platform-fees.module';
import { PlatformSettingsModule } from './common/platform-settings/platform-settings.module';
import { ContactModule } from './common/contact/contact.module';
import { ThrottlerStorageModule } from './common/throttler/throttler-storage.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import {
  lireEntierPositif,
  PALIER_AUTH_TTL_MS,
  PALIERS_GLOBAUX_DEFAUT,
  sauterPalierAuth,
} from './common/throttler/paliers.config';
import { SmsModule } from './shared/sms/sms.module';
import { EmailModule } from './shared/email/email.module';
import { CacheModule } from '@nestjs/cache-manager';
import { buildCacheModuleOptions } from './common/redis/cache.config';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './observability/logging/logger.config';
import { MetricsModule } from './observability/metrics/metrics.module';

function requireEnv(name: string): string {
  throw new Error(`Required environment variable ${name} is not set.`);
}

@Module({
  imports: [
    LoggerModule.forRoot(loggerConfig),
    MetricsModule,
    // ANO-13 — le magasin déclaré n'était pas honoré : `store: redisStore`
    // (cache-manager-ioredis, API cache-manager v3/v4) n'existe plus dans
    // cache-manager v7 / @nestjs/cache-manager v3, qui attendent `stores` avec
    // des instances Keyv. L'option inconnue était ignorée SANS ERREUR et le
    // cache retombait en mémoire de processus : les OTP d'inscription et les
    // codes OAuth n'étaient ni partagés entre réplicas ni conservés au
    // redémarrage — violation directe de la règle « stateless ».
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: buildCacheModuleOptions,
    }),

    // M-5 — les compteurs vivent dans Redis, pas dans la mémoire du processus :
    // partagés par tous les réplicas et conservés au redéploiement.
    //
    // DEUX filets GLOBAUX (`short`, `medium`), appliqués à toutes les routes et
    // désormais réglables par variables d'environnement sans réimager le
    // service (THROTTLE_SHORT_LIMIT/TTL, THROTTLE_MEDIUM_LIMIT/TTL — voir
    // .env.example et le ConfigMap k8s). Les valeurs par défaut sont celles qui
    // étaient écrites en dur ici.
    //
    // UN palier OPT-IN (`auth`) : il n'est évalué que sur les routes qui le
    // posent explicitement via `@Throttle({ auth: … })` — sign-in, OTP, reset,
    // MFA. Déclaré globalement, il refusait 97,8 % du trafic ANONYME dès
    // 34 req/s (mesure Artillery) : voir paliers.config.ts pour le détail et
    // pourquoi le retrait passe par `skipIf` et non par une suppression de la
    // déclaration.
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            name: 'short',
            ttl: lireEntierPositif(
              'THROTTLE_SHORT_TTL',
              PALIERS_GLOBAUX_DEFAUT.shortTtlMs,
            ),
            limit: lireEntierPositif(
              'THROTTLE_SHORT_LIMIT',
              PALIERS_GLOBAUX_DEFAUT.shortLimit,
            ),
          },
          {
            name: 'medium',
            ttl: lireEntierPositif(
              'THROTTLE_MEDIUM_TTL',
              PALIERS_GLOBAUX_DEFAUT.mediumTtlMs,
            ),
            limit: lireEntierPositif(
              'THROTTLE_MEDIUM_LIMIT',
              PALIERS_GLOBAUX_DEFAUT.mediumLimit,
            ),
          },
          // La limite vient du storage (source unique) : c'est elle qui sépare
          // les routes resserrées par @Throttle({ auth: … }) (fail-closed sur
          // panne Redis) d'un éventuel palier large. Une valeur écrite en dur
          // ici pourrait diverger et rouvrir — ou refermer — la mauvaise porte.
          {
            name: 'auth',
            ttl: PALIER_AUTH_TTL_MS,
            limit: RedisThrottlerStorage.AUTH_GLOBAL_LIMIT,
            skipIf: sauterPalierAuth,
          },
        ],
        storage,
      }),
    }),
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
    ProjectsModule,
    ReservationsModule,
    InvestmentsModule,
    WalletsModule,
    // Rapprochement quotidien du grand livre et du solde du prestataire.
    ReconciliationModule,
    ParrainageModule,
    PaymentsModule,
    SecondaryMarketModule,
    NotificationsModule,
    DocumentsModule,
    AvisModule,
    ReclamationsModule,
    NewsModule,
    KpiModule,
    // Proxy serveur des taux de change : la clé du fournisseur quitte le
    // bundle du front, où elle était inlinée et donc publique.
    ExchangeRatesModule,
    AdminModule,
    CgpModule,
    LocativeManagementModule,
    DistributionsModule,
    FiscaliteModule,
    AmlModule,
    // Anonymisation à la suppression de compte + cron de purge du barème de
    // conservation (lot 2, mission 3).
    RgpdModule,
    // Demande d'accès porteur instruite par BeOwn + drapeau `porteurAccess`
    // (lot 4, décision fondateur D1 — double accès investisseur/porteur).
    PorteurAccessModule,
    PlatformFeesModule,
    PlatformSettingsModule,
    ContactModule,
    // Endpoints de test d'e-mail/SMS : publics et déclenchant des envois réels.
    // Exposés uniquement hors production/staging ET sur opt-in explicite
    // (cf. areTestEndpointsEnabled).
    ...(areTestEndpointsEnabled() ? [NotificationTestModule] : []),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: MetricsThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountStatusGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
